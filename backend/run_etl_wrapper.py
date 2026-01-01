import os
import sys
import runpy

HERE = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, HERE)

# args for the ETL script
sys.argv = [
    "scripts/etl.py",
    "--repos-file",
    "tmp_repos.txt",
    "--metrics",
    "all",
]

script_path = os.path.join(HERE, "scripts", "etl.py")
runpy.run_path(script_path, run_name="__main__")
