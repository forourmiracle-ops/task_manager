#!/usr/bin/env python3
"""任务注册表 — 防止子Agent回调丢失（minimal版本）"""
import json, os, sys
from datetime import datetime

REGISTRY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "registry.json")

def _load():
    if os.path.exists(REGISTRY_FILE):
        with open(REGISTRY_FILE) as f: return json.load(f)
    return {"tasks": {}}

def _save(data):
    with open(REGISTRY_FILE, "w") as f: json.dump(data, f, ensure_ascii=False, indent=2)

def cmd_check():
    data = _load()
    unreported = [t for t in data["tasks"].values() 
                  if t.get("status") == "completed" and not t.get("reported")]
    if unreported:
        print(f"\n🔴 发现 {len(unreported)} 个未通知任务:")
        for t in unreported: print(f"  [{t['id']}] {t['desc']}")
    else:
        print("✅ 无未通知任务")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "check": cmd_check()
    else: print("用法: task_registry.py check")
