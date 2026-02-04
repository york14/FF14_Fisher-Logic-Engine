"""
Archive plans_and_specs and move troubleshooting logs
"""
import shutil
import os
from pathlib import Path

# Base directory
base_dir = Path(r"c:\Users\ys907\Documents\workspace\projects\pj_FF14_Fisher-Logic-Engine")

# Create archive directory
archive_dir = base_dir / "archive"
archive_dir.mkdir(exist_ok=True)
print(f"Created: {archive_dir}")

# Move plans_and_specs to archive
plans_and_specs = base_dir / "plans_and_specs"
archive_plans = archive_dir / "plans_and_specs"

if plans_and_specs.exists() and not archive_plans.exists():
    shutil.move(str(plans_and_specs), str(archive_plans))
    print(f"Moved: {plans_and_specs} -> {archive_plans}")
else:
    print(f"Skip: {plans_and_specs} (already moved or doesn't exist)")

# Create docs/troubleshooting directory
troubleshooting_dir = base_dir / "docs" / "troubleshooting"
troubleshooting_dir.mkdir(exist_ok=True)
print(f"Created: {troubleshooting_dir}")

# Move troubleshoot_logs to docs/troubleshooting
troubleshoot_logs = archive_plans / "troubleshoot_logs"
if troubleshoot_logs.exists():
    for log_file in troubleshoot_logs.glob("*"):
        if log_file.is_file():
            dest = troubleshooting_dir / log_file.name
            if not dest.exists():
                shutil.move(str(log_file), str(dest))
                print(f"Moved: {log_file.name}")
            else:
                print(f"Skip: {log_file.name} (already exists)")
    print(f"All logs moved to: {troubleshooting_dir}")
else:
    print(f"Skip: troubleshoot_logs directory not found")

print("\nArchive and migration completed successfully!")
