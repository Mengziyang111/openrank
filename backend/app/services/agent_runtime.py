from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.schemas.agent import AgentRequest, AgentResponse, Msg, Report
from app.tools.dataease_client import build_dashboard_link

logger = logging.getLogger(__name__)


_REPO_PATTERN = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")


def _extract_repo_mentioned(text: str | None) -> Optional[str]:
	if not text:
		return None
	match = _REPO_PATTERN.search(text)
	return match.group(0) if match else None


def _build_endpoint() -> str:
	base = settings.MAXKB_CHAT_URL or settings.MAXKB_BASE_URL
	if not base:
		raise ValueError("MAXKB_BASE_URL or MAXKB_CHAT_URL not set")
	return base.rstrip("/") + "/chat/completions"


def _infer_model_from_base() -> Optional[str]:
	if settings.MAXKB_MODEL:
		return settings.MAXKB_MODEL
	base = settings.MAXKB_BASE_URL or ""
	match = re.search(r"/api/([0-9a-fA-F-]{12,})", base)
	return match.group(1) if match else None


def _extract_piece(obj: Dict[str, Any]) -> str:
	ch = (obj.get("choices") or [{}])[0]
	delta = ch.get("delta") or {}
	msg = ch.get("message") or {}
	piece = delta.get("content") or msg.get("content")

	if not piece:
		ans = ch.get("answer_list") or obj.get("answer") or obj.get("content")
		if isinstance(ans, str):
			piece = ans
		elif isinstance(ans, list):
			buf: List[str] = []
			for it in ans:
				if isinstance(it, str):
					buf.append(it)
				elif isinstance(it, dict):
					buf.append(it.get("content") or it.get("text") or "")
			piece = "".join(buf)

	return piece or ""


async def run_agent(req: AgentRequest, db=None) -> AgentResponse:
	# 添加日志记录，检查接收到的参数
	logger.info("收到agent请求: query=%s, selected_repo=%s, messages=%s", req.query, req.selected_repo, len(req.messages))
	
	api_key = settings.MAXKB_API_KEY
	if not api_key:
		return AgentResponse(report=Report(text="MaxKB_API_KEY not set"), tool_results=[])

	url = _build_endpoint()
	headers = {
		"Authorization": f"Bearer {api_key}",
		"Content-Type": "application/json",
	}

	# 1. 优先使用selected_repo
	repo = req.selected_repo
	logger.info("使用的仓库: %s", repo)
	
	# 2. 构建基础用户消息
	user_msg = Msg(role="user", content=req.query)
	
	# 3. 构建系统消息，确保仓库信息被正确传递
	system_content = "你是OpenRank Agent，负责仓库健康分析。"
	
	# 4. 如果有仓库，强制使用该仓库
	if repo:
		# 直接将仓库信息添加到系统消息中，确保AI使用该仓库
		system_content += f"\n当前使用的仓库是：{repo}。请基于该仓库进行分析，不要询问用户提供仓库。"
		# 构建dashboard链接
		dashboard_url: Optional[str] = None
		try:
			dashboard_url = build_dashboard_link(settings.DATAEASE_PUBLIC_BASE_URL or settings.DATAEASE_BASE_URL, repo)
			if dashboard_url:
				system_content += f"\n相关数据大屏链接：{dashboard_url}"
		except Exception as e:
			logger.warning("build_dashboard_link failed: %s", e)
	else:
		# 如果没有仓库，提醒用户提供
		system_content += f"\n请提醒用户提供仓库信息，格式为 owner/repo。"
	
	# 5. 构建最终消息列表，系统消息 + 用户消息
	messages = [
		Msg(role="system", content=system_content),
		user_msg
	]
	
	# 6. 不再处理前端传递的messages，只使用当前的系统消息和用户消息
	logger.info("构建的消息列表: %s", messages)

	# Prefer request -> .env -> inferred app_id; final fallback uses qwen3-max to match your MaxKB base model
	model = req.model or settings.MAXKB_MODEL or _infer_model_from_base() or "qwen3-max"

	base_payload: Dict[str, Any] = {
		"messages": [m.model_dump() for m in messages],
		# MaxKB 对 stream=false 有已知 bug，强制开启流式规避
		"stream": True,
		"temperature": req.temperature,
		"max_tokens": req.max_tokens,
		"model": model,
	}

	async def _call(payload: Dict[str, Any]) -> AgentResponse:
		content_parts: List[str] = []
		raw_lines: List[str] = []
		raw_json_text: str = ""
		first_id: Optional[str] = None

		async with httpx.AsyncClient(timeout=None) as client:
			async with client.stream("POST", url, headers=headers, json=payload) as resp:
				if resp.status_code != 200:
					body = await resp.aread()
					msg = body.decode("utf-8", "ignore")
					raise ValueError(f"MaxKB HTTP {resp.status_code}: {msg}")

				ct = (resp.headers.get("content-type") or "").lower()
				logger.info("MaxKB resp content-type=%s", ct)

				if "application/json" in ct:
					raw_body = await resp.aread()
					raw_text = raw_body.decode("utf-8", "ignore")
					raw_json_text = raw_text
					obj = json.loads(raw_text)

					if isinstance(obj, dict) and "code" in obj and "message" in obj:
						raise ValueError(obj.get("message") or raw_text)
					piece = _extract_piece(obj)

					if piece:
						content_parts.append(piece)
					first_id = obj.get("id") or first_id

				else:
					async for line in resp.aiter_lines():
						if not line:
							continue
						s = line.strip()
						if s.startswith("event:") or s.startswith(":"):
							continue
						if s.startswith("data:"):
							s = s[5:].strip()
						if not s:
							continue
						if s == "[DONE]":
							break

						raw_lines.append(s)
						try:
							obj = json.loads(s)
						except Exception:
							continue

						if first_id is None:
							first_id = obj.get("id")

						piece = _extract_piece(obj)
						if piece:
							content_parts.append(piece)

		final_text = "".join(content_parts).strip()
		if not final_text:
			raw_hint = "".join(raw_lines).strip()
			if not raw_hint and raw_json_text:
				raw_hint = raw_json_text
			final_text = raw_hint or ""

		if not final_text:
			final_text = "(empty response)"

		# 不再强制追加链接，让 AI 根据上下文自然回答
		# 如果 AI 的回答中没有提到数据大屏，且用户可能对此感兴趣，可以在回答末尾添加
		# 但不要强制添加，让 AI 自己决定是否需要提及
		# 注释掉自动追加，避免 AI 误以为这是它必须回答的内容
		# if dashboard_url and "DataEase" not in final_text and "大屏" not in final_text:
		#     final_text = f"{final_text}\n\n💡 提示：你可以通过 [数据大屏]({dashboard_url}) 查看更详细的可视化数据。"

		tool_results: List[Dict[str, Any]] = []
		if dashboard_url:
			tool_results.append({"type": "dashboard_url", "repo": repo_for_link, "url": dashboard_url})

		return AgentResponse(report=Report(text=final_text), tool_results=tool_results)

	# First try
	try:
		return await _call(base_payload)
	except ValueError as e:
		err_msg = str(e)
		# Retry once with stream forced true (already true) in case upstream ignored; keep same payload
		if "generator" in err_msg and "content" in err_msg:
			logger.warning("MaxKB generator/content error, retrying with stream=true. msg=%s", err_msg)
			try:
				return await _call(base_payload)
			except ValueError as e2:
				err_msg = str(e2)

		logger.error("MaxKB call failed: %s", err_msg)
		return AgentResponse(report=Report(text=f"MaxKB 服务异常：{err_msg}"), tool_results=[])
