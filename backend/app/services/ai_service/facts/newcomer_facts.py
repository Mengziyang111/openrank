"""Newcomer facts extractor from repo_catalog, repo_issues, and repo_docs."""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.db.models import HealthOverviewDaily
from app.models import RepoCatalog, RepoDoc, RepoIssue


class NewcomerFactsExtractor:
    """Extract newcomer facts from database."""

    def __init__(self, db: Session):
        """Initialize with database session.

        Args:
            db: Database session
        """
        self.db = db

    def extract_facts(self, domain: str, stack: str, time_per_week: str, keywords: str, top_n: int = 3) -> Dict[str, Any]:
        """Extract newcomer facts based on user input.

        Args:
            domain: Interest domain (e.g., frontend, backend, ai_ml)
            stack: Technology stack (e.g., javascript, python, go)
            time_per_week: Time available per week (e.g., 1-2h, 3-5h)
            keywords: Additional keywords for filtering
            top_n: Number of top repositories to return

        Returns:
            Facts about recommended repositories for newcomers
        """
        facts = {
            "input": {
                "domain": domain,
                "stack": stack,
                "time_per_week": time_per_week,
                "keywords": keywords
            },
            "top_repos": [],
            "data_quality": {
                "available_repos": 0,
                "missing_fields": [],
                "warnings": []
            }
        }

        # Get recommended repositories
        recommended_repos = self._get_recommended_repos(domain, stack, keywords, top_n)
        facts["top_repos"] = recommended_repos
        facts["data_quality"]["available_repos"] = len(recommended_repos)

        if not recommended_repos:
            facts["data_quality"]["warnings"].append("No recommended repositories found based on the provided criteria")

        return facts

    def _get_recommended_repos(self, domain: str, stack: str, keywords: str, top_n: int) -> List[Dict[str, Any]]:
        """Get recommended repositories for newcomers.

        Args:
            domain: Interest domain
            stack: Technology stack
            keywords: Additional keywords
            top_n: Number of top repositories to return

        Returns:
            List of recommended repositories with details
        """
        recommended_repos = []

        # Get repositories from catalog
        repos = self._search_repo_catalog(domain, stack, keywords, limit=top_n * 2)
        
        for repo in repos:
            repo_facts = {
                "repo_full_name": repo.repo_full_name,
                "fit_score": 80,  # 默认值
                "readiness_score": 75,  # 默认值
                "difficulty": "Medium",  # 默认值
                "trend_delta": 5,  # 默认值
                "reasons": ["领域匹配", "技术栈相关"],  # 默认值
                "readiness_evidence": {},
                "tasks": [],
                "onboarding": {}
            }

            # Get readiness evidence from health data
            repo_facts["readiness_evidence"] = self._get_readiness_evidence(repo.repo_full_name)
            
            # Get tasks from repo_issues
            repo_facts["tasks"] = self._get_newcomer_tasks(repo.repo_full_name)
            
            # Get onboarding info from repo_docs
            repo_facts["onboarding"] = self._get_onboarding_info(repo.repo_full_name)
            
            recommended_repos.append(repo_facts)

            if len(recommended_repos) >= top_n:
                break

        return recommended_repos

    def _search_repo_catalog(self, domain: str, stack: str, keywords: str, limit: int = 10) -> List[RepoCatalog]:
        """Search repository catalog based on criteria.

        Args:
            domain: Interest domain
            stack: Technology stack
            keywords: Additional keywords
            limit: Maximum number of repositories to return

        Returns:
            List of matching repositories
        """
        # This is a placeholder implementation
        # In a real implementation, this would search the repo_catalog table
        # and apply filters based on domain, stack, and keywords
        from app.models import RepoCatalog
        return self.db.query(RepoCatalog).limit(limit).all()

    def _get_readiness_evidence(self, repo_full_name: str) -> Dict[str, Any]:
        """Get readiness evidence for a repository.

        Args:
            repo_full_name: Repository full name

        Returns:
            Readiness evidence
        """
        evidence = {
            "responsiveness": {},
            "activity": {},
            "task_supply": {},
            "onboarding": {}
        }

        # Get latest health data for the repository
        latest_health = self.db.query(HealthOverviewDaily).filter(
            HealthOverviewDaily.repo_full_name == repo_full_name
        ).order_by(desc(HealthOverviewDaily.dt)).first()

        if latest_health:
            # Responsiveness metrics
            evidence["responsiveness"] = {
                "issue_response_time_h": latest_health.metric_issue_response_time_h,
                "pr_response_time_h": latest_health.metric_pr_response_time_h,
                "issue_age_h": latest_health.metric_issue_age_h,
                "pr_age_h": latest_health.metric_pr_age_h
            }

            # Activity metrics
            evidence["activity"] = {
                "activity_3m": latest_health.metric_activity_3m,
                "new_contributors": latest_health.metric_new_contributors,
                "activity_growth": latest_health.metric_activity_growth
            }

        # Get task supply from repo_issues
        evidence["task_supply"] = self._get_task_supply(repo_full_name)

        # Get onboarding info from repo_docs
        evidence["onboarding"] = self._get_onboarding_metrics(repo_full_name)

        return evidence

    def _get_task_supply(self, repo_full_name: str) -> Dict[str, Any]:
        """Get task supply metrics for a repository.

        Args:
            repo_full_name: Repository full name

        Returns:
            Task supply metrics
        """
        # This is a placeholder implementation
        # In a real implementation, this would query the repo_issues table
        return {
            "good_first_issues": 0,
            "help_wanted_issues": 0,
            "documentation_issues": 0,
            "bug_issues": 0
        }

    def _get_onboarding_metrics(self, repo_full_name: str) -> Dict[str, Any]:
        """Get onboarding metrics for a repository.

        Args:
            repo_full_name: Repository full name

        Returns:
            Onboarding metrics
        """
        # This is a placeholder implementation
        # In a real implementation, this would query the repo_docs table
        return {
            "has_readme": False,
            "has_contributing": False,
            "has_pr_template": False,
            "has_setup_guide": False
        }

    def _get_newcomer_tasks(self, repo_full_name: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get newcomer-friendly tasks for a repository.

        Args:
            repo_full_name: Repository full name
            limit: Maximum number of tasks to return

        Returns:
            List of newcomer-friendly tasks
        """
        # This is a placeholder implementation
        # In a real implementation, this would query the repo_issues table
        # and filter for newcomer-friendly issues
        return []

    def _get_onboarding_info(self, repo_full_name: str) -> Dict[str, Any]:
        """Get onboarding information for a repository.

        Args:
            repo_full_name: Repository full name

        Returns:
            Onboarding information
        """
        # This is a placeholder implementation
        # In a real implementation, this would query the repo_docs table
        return {
            "has_readme": False,
            "has_contributing": False,
            "has_pr_template": False,
            "setup_guide": None,
            "build_guide": None,
            "test_guide": None
        }


# Helper function to create extractor
def create_newcomer_facts_extractor(db: Session) -> NewcomerFactsExtractor:
    """Create a newcomer facts extractor.

    Args:
        db: Database session

    Returns:
        Newcomer facts extractor
    """
    return NewcomerFactsExtractor(db)
