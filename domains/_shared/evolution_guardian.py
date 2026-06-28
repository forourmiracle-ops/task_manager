#!/usr/bin/env python3
"""
Evolution Guardian v5.2.0 — Domain架构入口（自包含实现）
================================================

独立运行的四档守护脚本，不依赖委托。
直接操作 domains/{domain}/ 下的JSON文件。

★ v5.2.0 核心升级（跨语种经验检索）：
  - 新增 _detect_language(): 轻量语种检测（基于Unicode码点分布）
  - 新增 _extract_keywords(): 从文本自动提取中/英/混合语义关键词
  - 新增 _expand_bilingual(): 双语术语映射扩展（内置200+术语对）
  - 所有经验写入点（log --lesson/auto-review/distill）调用_extract_keywords生成高质量keywords
  - 经验写入时自动标记 lang 字段（zh/en/mixed）
  - 存量修复脚本 fix_experiences_keywords.py

★ v5.1.0 核心升级（23项优化）：
  - 统一路径解析器 _resolve_paths()，部署时自动检测本地路径并缓存
  - cmd_log 增加 --context 和 --trace 参数（GEPA思想：记录"为什么失败"）
  - _append_lesson_to_domain 增加去重(>=85%)+冲突检测(50-85%)+supersedes链
  - _scenario_exists 重写：单字级分词、85%阈值、短文本保护
  - _update_task_type_stats 增加 error_cat 统计维度
  - R1异步执行增加错误日志（auto-review.log）
  - R2增强：同时检查 task_type 和 error_cat 两个维度
  - _check_memory_size 使用统一路径
  - immune_rules 增加 timestamp 字段
  - 新增 hot-experiences 子命令（输出高价值经验供上下文注入）
  - 新增 decay 子命令（经验置信度衰减 + 废弃）
  - review 增加 Skill 生成提议
  - distill 系列路径统一
  - 删除频率限制（去重足够防冗余）
  - _find_project_root 增加健壮性（CWD兜底）
  - cmd_log 自动创建域时同步注册 index.json（★关键修复）
  - token/耗时自动记录优化
  - main() 帮助文本更新

★ v5.0.0 核心升级：闭环学习系统
  - cmd_review 从空壳print → 自动经验提取引擎
  - R1触发后可自动执行轻量review（--auto模式）
  - 从任务日志中识别重复成功模式→提炼L2经验
  - 从失败记录中自动生成免疫规则
  - 学习环真正闭合: log → R1触发 → auto-review → 写入experiences → Router下次加载

★ 正确蒸馏流程（三段式，不可跳步）：
  每日日志(YYYY-MM-DD.md)
    → distill --from-daily   → STM新内容区（临时缓冲）
    → distill --from-stm     → MEMORY.md（元层，PINNED区之后）
    → distill                → experiences.json（具体经验）

  直接蒸馏MEMORY.md（distill不带参数）仅用于紧急应急，不是常规流程！

v5.1.0新增命令:
  python3 evolution_guardian.py hot-experiences [数量]     # 输出高价值经验
  python3 evolution_guardian.py decay [--dry-run]          # 经验置信度衰减

v5.0.0新增:
  - cmd_review 重写: 自动从最近N条任务日志中提取经验草案
  - R1触发器支持 --auto-review: 到达review节点时自动执行轻量提取
  - _extract_experiences_from_tasks(): 核心经验提取算法

用法:
  # ★ 常规蒸馏流程（按顺序执行）
  python3 evolution_guardian.py distill --from-daily [--date=YYYY-MM-DD] [--dry-run]
  python3 evolution_guardian.py distill --from-stm [--dry-run]
  python3 evolution_guardian.py distill [--dry-run]          # 仅应急，将MEMORY.md具体经验下沉

  # 记账（支持 --trace/--context）
  python3 evolution_guardian.py log data "任务" success "" "" 0 0 --trace="tool1→tool2" --context="因为X选择Y"
  python3 evolution_guardian.py log data "任务" failed timeout API调用 --lesson="需要增加超时重试"

  # 其他命令
  python3 evolution_guardian.py check data
  python3 evolution_guardian.py feedback admin negative strong "词" "上下文"
  python3 evolution_guardian.py experience-update data <old_id> deprecate
  python3 evolution_guardian.py archive-logs [--days=15]
  python3 evolution_guardian.py hot-experiences [5]
  python3 evolution_guardian.py decay [--dry-run]

  # ★ v5.0 新增：复盘（自动经验提取）
  python3 evolution_guardian.py review data              # 完整复盘报告 + 自动提取
  python3 evolution_guardian.py review data --auto       # R1触发的轻量自动提取
"""

import json
import os
import re
import sys
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


# ===== 修改18: _find_project_root 增加健壮性 =====

def _find_project_root():
    """向上搜索项目根目录 — v5.1增强：优先检查domains/子目录，CWD兜底"""
    current = os.path.dirname(SCRIPT_DIR)
    for _ in range(6):
        parent = os.path.dirname(current)
        if parent == current:
            break
        # ★ v5.1: 优先检查 domains/ 子目录（最精确的项目根标志）
        # 必须排除 current 本身就是 domains 目录的情况
        if os.path.isdir(os.path.join(current, "domains")) and \
           os.path.basename(current) != "domains":
            return current
        current = parent
    # 回退: 验证回退路径合理性
    fallback = os.path.dirname(os.path.dirname(SCRIPT_DIR))
    if os.path.isdir(os.path.join(fallback, "domains")) and \
       os.path.basename(fallback) != "domains":
        return fallback
    # 最终兜底：使用CWD
    cwd = os.getcwd()
    if os.path.isdir(os.path.join(cwd, "domains")):
        return cwd
    return fallback


def _get_domain_dir(domain):
    """获取域目录路径"""
    return os.path.join(_find_project_root(), "domains", domain)


def _list_available_domains() -> list:
    """★ v4.5.3: 列出当前已部署的所有域（domains/下所有非_shared子目录）"""
    domains_root = os.path.join(_find_project_root(), "domains")
    if not os.path.isdir(domains_root):
        return []
    return sorted([
        d for d in os.listdir(domains_root)
        if d != "_shared" and not d.startswith(".")
        and os.path.isdir(os.path.join(domains_root, d))
    ])


def _validate_domain(domain: str, auto_create: bool = False) -> tuple:
    """★ v4.5.3: 校验域是否已部署"""
    if not domain or not domain.strip():
        return False, "❌ 域名为空。用法: <command> <domain> ..."

    domain_dir = _get_domain_dir(domain)
    if os.path.isdir(domain_dir):
        return True, ""

    # 域不存在
    available = _list_available_domains()
    if not available:
        msg = (
            f"❌ 域 '{domain}' 不存在，且当前项目尚未部署任何域。\n"
            f"   请先运行: python3 {{SKILL_PATH}}/scripts/upgrade_agent.py --deploy\n"
            f"   或运行: python3 domains/_shared/upgrade_agent.py --deploy"
        )
    else:
        msg = (
            f"❌ 域 '{domain}' 不存在。\n"
            f"   当前已部署的域: {', '.join(available)}\n"
            f"   建议:\n"
            f"     1. 用其中一个已有域名重试: log {available[0]} ...\n"
            f"     2. 用路由自动匹配域: python3 domains/_shared/domain_router.py \"<任务描述>\"\n"
            f"     3. 如确实需要新域，重新运行 --deploy 让系统智能推断"
        )
    if auto_create:
        return True, msg + "\n   ⚠️  --auto-create 已启用，将创建该域。"
    return False, msg


def _ensure_evo_dir(domain):
    """确保域的自进化目录存在（仅用于已部署的域）"""
    d = _get_domain_dir(domain)
    os.makedirs(d, exist_ok=True)
    return d


def _read_json(path, default=None):
    """安全读取JSON — v4.6.7: 损坏文件备份+警告"""
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, ValueError) as e:
            bak = f"{path}.corrupted-{int(time.time())}.bak"
            try:
                shutil.copy2(path, bak)
                sys.stderr.write(
                    f"⚠️  JSON损坏 {path}\n"
                    f"   错误: {e}\n"
                    f"   已备份到: {bak}（请人工检查后恢复）\n"
                )
            except Exception:
                sys.stderr.write(f"⚠️  JSON损坏且备份失败 {path}: {e}\n")
        except Exception as e:
            sys.stderr.write(f"⚠️  读取失败 {path}: {e}\n")
    return default if default is not None else {}


def _write_json(path, data):
    """安全写入JSON — v4.6.7: 原子写入"""
    tmp = f"{path}.tmp.{os.getpid()}"
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            try:
                os.fsync(f.fileno())
            except (OSError, AttributeError):
                pass
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except Exception:
                pass
        raise


# ===== 修改1: _resolve_paths 统一路径解析器 =====

_PATHS_CACHE = None

def _resolve_paths() -> dict:
    """★ v5.1 统一路径解析 — 部署时自动检测用户本地文件路径并缓存到evo-config.json"""
    global _PATHS_CACHE
    if _PATHS_CACHE:
        return _PATHS_CACHE

    root = _find_project_root()

    # 验证 root 合理性（必须有 domains/ 目录）
    if not os.path.isdir(os.path.join(root, "domains")):
        sys.stderr.write(f"⚠️  _resolve_paths: root={root} 下不存在 domains/ 目录\n")

    config_file = os.path.join(root, "domains", "_shared", "evo-config.json")
    config = _read_json(config_file, {})

    # 如果配置中已有且路径有效
    cached_paths = config.get("resolved_paths", {})
    if cached_paths and os.path.isdir(cached_paths.get("memory_dir", "")):
        _PATHS_CACHE = cached_paths
        return _PATHS_CACHE

    # ★ v5.1.1: 搜索记忆目录 — 多候选，不假设任何IDE特定路径
    memory_dir_candidates = [
        os.path.join(root, "memory"),               # 工作空间根/memory/（IDE无关）
        os.path.join(root, ".workbuddy", "memory"),  # WorkBuddy约定（兼容已有）
        os.path.join(root, ".openclaw", "memory"),   # 其他IDE约定
        os.path.join(root, ".cursor", "memory"),     # Cursor约定
    ]
    memory_dir = next((d for d in memory_dir_candidates if os.path.isdir(d)), None)
    if not memory_dir:
        memory_dir = memory_dir_candidates[0]
        os.makedirs(memory_dir, exist_ok=True)

    # ★ v5.1.1: 搜索MEMORY.md — 先在已发现的memory_dir中查找
    memory_file_candidates = [
        os.path.join(memory_dir, "MEMORY.md"),            # memory_dir内（首选）
        os.path.join(root, "MEMORY.md"),                   # 工作空间根
    ]
    memory_file = next((p for p in memory_file_candidates if os.path.exists(p)), memory_file_candidates[0])

    stm_candidates = [
        os.path.join(memory_dir, "short-term-memory.md"),
        os.path.join(root, "short-term-memory.md"),
    ]
    stm_file = next((p for p in stm_candidates if os.path.exists(p)), stm_candidates[0])

    feedback_file = os.path.join(root, "domains", "_shared", "evo-feedback.json")

    paths = {
        "memory_dir": memory_dir,
        "memory_file": memory_file,
        "stm_file": stm_file,
        "feedback_file": feedback_file,
        "root": root,
    }

    config["resolved_paths"] = paths
    try:
        _write_json(config_file, config)
    except Exception:
        pass  # 写入失败不阻塞流程

    _PATHS_CACHE = paths
    return _PATHS_CACHE


# ===== v5.2: 语种检测 + 关键词提取 + 双语扩展 =====

# 高频技术/业务术语双语映射表（轻量内置，无需外部依赖）
_BILINGUAL_TERMS = {
    # 技术通用
    "查询": "query", "搜索": "search", "数据": "data", "接口": "api",
    "部署": "deploy", "配置": "config", "脚本": "script", "文件": "file",
    "目录": "directory", "路径": "path", "模板": "template", "参数": "parameter",
    "超时": "timeout", "重试": "retry", "缓存": "cache", "权限": "permission",
    "认证": "auth", "令牌": "token", "加密": "encrypt", "解析": "parse",
    "编码": "encoding", "格式": "format", "转换": "convert", "验证": "validate",
    "测试": "test", "调试": "debug", "日志": "log", "监控": "monitor",
    "报错": "error", "异常": "exception", "失败": "failure", "成功": "success",
    "重构": "refactor", "优化": "optimize", "迁移": "migrate", "升级": "upgrade",
    "依赖": "dependency", "版本": "version", "分支": "branch", "提交": "commit",
    "合并": "merge", "冲突": "conflict", "回滚": "rollback", "备份": "backup",
    "数据库": "database", "索引": "index", "字段": "field", "主键": "primary key",
    "外键": "foreign key", "表": "table", "视图": "view", "存储": "storage",
    # 业务/金融
    "基金": "fund", "股票": "stock", "债券": "bond", "指数": "index",
    "净值": "nav", "持仓": "holding", "分红": "dividend", "估值": "valuation",
    "收益": "return", "风险": "risk", "合规": "compliance", "审计": "audit",
    "报表": "report", "财务": "finance", "资产": "asset", "负债": "liability",
    "利润": "profit", "营收": "revenue", "市值": "market cap",
    # AI/自进化相关
    "经验": "experience", "规则": "rule", "路由": "route", "蒸馏": "distill",
    "进化": "evolution", "记忆": "memory", "域": "domain", "技能": "skill",
    "提示词": "prompt", "上下文": "context", "模型": "model",
    # 反向映射（英→中），从上面自动构建
}
# 构建反向映射
_BILINGUAL_TERMS_REVERSE = {v: k for k, v in _BILINGUAL_TERMS.items()}

# 中文停用词（用于关键词提取时过滤）
_CN_STOPWORDS = set("的了是在有我他她它这那就都也还把被给从到对和与或如果因为所以但是而且虽然可以能够已经正在将要不会没有应该必须可能"
                    "需要进行一个一下帮我请问怎么什么如何为什么哪个哪些多少几个")

# 英文停用词
_EN_STOPWORDS = set("the a an is are was were be been being have has had do does did will would "
                    "shall should can could may might must need to of in on at by for with from "
                    "about into through during before after above below between out up down "
                    "and or but not no nor so yet both either neither each every all any few "
                    "more most other some such than too very this that these those it its i me "
                    "my we our you your he him his she her they them their what which who whom "
                    "how when where why if then else".split())


def _detect_language(text: str) -> str:
    """轻量语种检测（不依赖外部库）
    
    基于Unicode码点分布判断：
    - CJK字符占比>30% → 'zh'
    - 纯ASCII字母为主 → 'en'
    - 混合 → 'mixed'
    """
    if not text or not text.strip():
        return "en"
    
    cjk_count = 0
    ascii_letter_count = 0
    total_chars = 0
    
    for ch in text:
        if ch.isspace() or ch in '.,;:!?()[]{}"\'-_/\\@#$%^&*+=<>~`|':
            continue
        total_chars += 1
        # CJK Unified Ideographs + Extension A + Compatibility
        if '\u4e00' <= ch <= '\u9fff' or '\u3400' <= ch <= '\u4dbf' or '\uf900' <= ch <= '\ufaff':
            cjk_count += 1
        elif ch.isascii() and ch.isalpha():
            ascii_letter_count += 1
    
    if total_chars == 0:
        return "en"
    
    cjk_ratio = cjk_count / total_chars
    ascii_ratio = ascii_letter_count / total_chars
    
    if cjk_ratio > 0.3:
        if ascii_ratio > 0.3:
            return "mixed"
        return "zh"
    return "en"


def _extract_keywords(text: str, lang: str = "auto", max_keywords: int = 8) -> list:
    """从文本中自动提取语义关键词（中/英/混合）
    
    策略：
    1. 中文：提取2-4字有意义的词组（排除虚词）
    2. 英文：提取3+字母单词（排除停用词）
    3. 混合场景：两种都提取
    4. 自动去重并限制数量
    
    Args:
        text: 输入文本
        lang: 语种 ('zh'/'en'/'mixed'/'auto')
        max_keywords: 最大关键词数量
    
    Returns:
        关键词列表（已去重，已去除虚词/停用词）
    """
    if not text or not text.strip():
        return []
    
    if lang == "auto":
        lang = _detect_language(text)
    
    keywords = []
    
    # 中文关键词提取
    if lang in ("zh", "mixed"):
        # 提取2-4字中文词组
        # 策略：用标点和非中文字符分割，然后提取有意义的片段
        segments = re.split(r'[^\u4e00-\u9fff]+', text)
        for seg in segments:
            if len(seg) < 2:
                continue
            # 从segment中提取2-4字词组
            if len(seg) <= 4:
                # 短片段直接作为关键词（去停用词检查）
                if not all(c in _CN_STOPWORDS for c in seg):
                    keywords.append(seg)
            else:
                # 长片段：滑动窗口取2-4字
                # 优先取4字、3字、2字
                added_from_seg = set()
                for window in (4, 3, 2):
                    for i in range(len(seg) - window + 1):
                        candidate = seg[i:i+window]
                        # 排除：首字或尾字是停用词中的单字
                        if candidate[0] in _CN_STOPWORDS or candidate[-1] in _CN_STOPWORDS:
                            continue
                        # 排除：整个候选都在停用词中
                        if all(c in _CN_STOPWORDS for c in candidate):
                            continue
                        # 避免重复子串
                        if any(candidate in added for added in added_from_seg):
                            continue
                        if any(added in candidate for added in added_from_seg):
                            # 新候选包含已有的，用新候选替换（更长更有语义）
                            added_from_seg = {a for a in added_from_seg if a not in candidate}
                        added_from_seg.add(candidate)
                keywords.extend(list(added_from_seg)[:3])  # 每段最多取3个
    
    # 英文关键词提取
    if lang in ("en", "mixed"):
        # 提取3+字母的英文单词（排除停用词）
        en_words = re.findall(r'[a-zA-Z][a-zA-Z_-]{2,}', text)
        for word in en_words:
            w_lower = word.lower()
            if w_lower not in _EN_STOPWORDS and len(w_lower) >= 3:
                keywords.append(w_lower)
    
    # 去重（保持顺序）
    seen = set()
    unique_keywords = []
    for kw in keywords:
        kw_norm = kw.lower()
        if kw_norm not in seen:
            seen.add(kw_norm)
            unique_keywords.append(kw)
    
    return unique_keywords[:max_keywords]


def _expand_bilingual(keywords: list) -> list:
    """对关键词列表进行双语扩展
    
    中文关键词 → 查映射表 → 追加英文对照
    英文关键词 → 查映射表 → 追加中文对照
    
    Args:
        keywords: 原始关键词列表
    
    Returns:
        扩展后的关键词列表（原始 + 翻译别名，已去重）
    """
    if not keywords:
        return []
    
    expanded = list(keywords)  # 保留原始
    seen = set(kw.lower() for kw in keywords)
    
    for kw in keywords:
        kw_lower = kw.lower()
        # 尝试中→英
        if kw in _BILINGUAL_TERMS:
            en_term = _BILINGUAL_TERMS[kw]
            if en_term.lower() not in seen:
                expanded.append(en_term)
                seen.add(en_term.lower())
        # 尝试英→中
        elif kw_lower in _BILINGUAL_TERMS_REVERSE:
            zh_term = _BILINGUAL_TERMS_REVERSE[kw_lower]
            if zh_term not in seen:
                expanded.append(zh_term)
                seen.add(zh_term)
        # 部分匹配：关键词包含映射表中的词
        else:
            for zh, en in _BILINGUAL_TERMS.items():
                if zh in kw and en.lower() not in seen:
                    expanded.append(en)
                    seen.add(en.lower())
                    break
                elif kw_lower == en.lower() and zh not in seen:
                    expanded.append(zh)
                    seen.add(zh)
                    break
    
    return expanded


# ===== 阈值自检引擎（v4.1 新增）=====

def _normalize_task_type(task: str) -> str:
    """将任务描述归一化为类型键"""
    return task.strip()[:18]


def _read_trigger_config():
    """读取evo-config.json中的触发阈值配置"""
    root = _find_project_root()
    cfg = _read_json(os.path.join(root, "domains", "_shared", "evo-config.json"), {})
    return cfg.get("trigger_config", {
        "consecutive_error_threshold": 2,
        "error_window": 5,
        "negative_feedback_threshold": 1,
        "feedback_window_days": 7,
        "review_every_n_tasks": 3,
    })


# ===== 修改5: _update_task_type_stats 增加error_cat统计 =====

def _update_task_type_stats(mem_file: str, task: str, result: str, error_cat: str = ""):
    """★ v5.1: 按任务类型分类统计 + error_cat维度统计"""
    mem = _read_json(mem_file, {})
    if "task_type_counts" not in mem:
        mem["task_type_counts"] = {}

    type_key = _normalize_task_type(task)

    if type_key not in mem["task_type_counts"]:
        mem["task_type_counts"][type_key] = {
            "total": 0, "success": 0, "failed": 0, "partial": 0,
            "consecutive_errors": 0, "last_results": [],
        }

    ttc = mem["task_type_counts"][type_key]
    ttc["total"] += 1
    if result == "success":
        ttc["success"] += 1
        ttc["consecutive_errors"] = 0
    elif result == "failed":
        ttc["failed"] += 1
        ttc["consecutive_errors"] = ttc.get("consecutive_errors", 0) + 1
    elif result == "partial":
        ttc["partial"] += 1
        ttc["consecutive_errors"] = 0

    ttc["last_results"].append({
        "result": result, "ts": datetime.now().isoformat(),
    })
    ttc["last_results"] = ttc["last_results"][-10:]

    # ★ v5.1: error_cat 维度统计
    if error_cat and error_cat.strip():
        if "error_cat_counts" not in mem:
            mem["error_cat_counts"] = {}
        cat_key = error_cat.strip()
        if cat_key not in mem["error_cat_counts"]:
            mem["error_cat_counts"][cat_key] = {"consecutive_errors": 0, "total_errors": 0}
        ecc = mem["error_cat_counts"][cat_key]
        if result == "failed":
            ecc["consecutive_errors"] += 1
            ecc["total_errors"] += 1
        else:
            ecc["consecutive_errors"] = 0

    _write_json(mem_file, mem)
    return ttc


# ===== 修改7: _check_memory_size 使用统一路径 =====

def _check_memory_size(root: str, threshold: int = 200) -> tuple:
    """★ v5.1: 检测MEMORY.md行数，使用_resolve_paths统一路径"""
    paths = _resolve_paths()
    memory_path = paths.get("memory_file", os.path.join(root, "memory", "MEMORY.md"))
    stm_path = paths.get("stm_file", os.path.join(root, "memory", "short-term-memory.md"))

    mem_lines = 0
    stm_lines = 0

    if os.path.exists(memory_path):
        with open(memory_path, "r", encoding="utf-8") as f:
            mem_lines = sum(1 for _ in f)

    if os.path.exists(stm_path):
        with open(stm_path, "r", encoding="utf-8") as f:
            stm_lines = sum(1 for _ in f)

    return mem_lines, stm_lines, (mem_lines > threshold)


# ===== 修改6: _auto_check_triggers R2增强 =====

def _auto_check_triggers(domain: str, mem_file: str, task: str, result: str):
    """★ v5.1增强: R2同时检查task_type和error_cat两个维度"""
    mem = _read_json(mem_file, {})
    stats = mem.get("statistics", {})
    cfg = _read_trigger_config()
    triggers = []

    # ── R1: 每 N 次任务触发 review ──
    review_n = cfg.get("review_every_n_tasks", 3)
    total = stats.get("total_tasks", 0)
    if total > 0 and total % review_n == 0:
        triggers.append({
            "id": "R1_PERIODIC_REVIEW",
            "level": "info",
            "icon": "\U0001F4CA",  # 📊
            "message": f"本域已累计 {total} 次任务（每{review_n}次节点）",
            "action": f"执行 review {domain} → 回顾近期任务模式 → 如有新经验追加到 experiences.json",
        })

    # ── R2: 同类任务连续错误检测 + error_cat维度 ──
    type_key = _normalize_task_type(task)
    ttc = mem.get("task_type_counts", {}).get(type_key, {})
    consec_err = ttc.get("consecutive_errors", 0)
    err_threshold = cfg.get("consecutive_error_threshold", 2)

    # ★ v5.1: 同时检查 error_cat_counts
    ecc = mem.get("error_cat_counts", {})
    recent_cat_err = 0
    recent_cat_name = ""
    for cat_name, cat_data in ecc.items():
        if cat_data.get("consecutive_errors", 0) >= err_threshold:
            recent_cat_err = cat_data["consecutive_errors"]
            recent_cat_name = cat_name
            break

    r2_triggered = consec_err >= err_threshold or recent_cat_err >= err_threshold

    if r2_triggered:
        err_detail = f"任务类型「{type_key}...」连续犯错 {consec_err} 次"
        if recent_cat_err >= err_threshold:
            err_detail += f" | 错误类别「{recent_cat_name}」连续 {recent_cat_err} 次"
        triggers.append({
            "id": "R2_CONSECUTIVE_ERRORS",
            "level": "critical",
            "icon": "\U0001F534",  # 🔴
            "message": f"{err_detail} (阈值={err_threshold})",
            "action": (
                f"立即执行 review {domain} → 从最近失败中提取教训 → "
                f"追加 immune_rules.json（severity=critical）→ "
                f"追加 experiences.json（L2层）"
            ),
        })

    # ── R3: 负面反馈检测 ──
    root = _find_project_root()
    paths = _resolve_paths()
    fb_file = paths.get("feedback_file", os.path.join(root, "domains", "_shared", "evo-feedback.json"))
    fb = _read_json(fb_file, {"feedback_records": []})
    unresolved_negatives = [
        f for f in fb.get("feedback_records", [])
        if f.get("type") == "negative"
        and f.get("status") != "resolved"
        and (f.get("phrase") or "").strip()
    ]
    fb_threshold = cfg.get("negative_feedback_threshold", 1)

    if len(unresolved_negatives) >= fb_threshold:
        latest_fb = unresolved_negatives[-1]
        triggers.append({
            "id": "R3_NEGATIVE_FEEDBACK",
            "level": "critical",
            "icon": "\u26A0\uFE0F",  # ⚠️
            "message": (
                f"收到 {len(unresolved_negatives)} 条未处理负面反馈 | "
                f"最新:「{latest_fb.get('phrase', '')}」"
            ),
            "action": (
                f"立即执行 evolve {domain} \"用户负面反馈:{latest_fb.get('phrase', '')}\" → "
                f"分析反馈根因 → 修正经验/规则 → 改进后续执行策略"
            ),
        })

    # ── R4: MEMORY.md行数检测 ──
    mem_threshold = cfg.get("memory_line_threshold", 200)
    mem_lines, stm_lines, mem_over = _check_memory_size(root, mem_threshold)

    if mem_over:
        triggers.append({
            "id": "R4_MEMORY_OVERFLOW",
            "level": "warn",
            "icon": "\U0001F4CB",  # 📋
            "message": (
                f"MEMORY.md当前 {mem_lines} 行，超过阈值 {mem_threshold} 行"
                + (f" | short-term-memory.md: {stm_lines} 行待提炼" if stm_lines > 0 else "")
            ),
            "action": (
                "运行 python3 evolution_guardian.py distill --dry-run 预览 → "
                "确认无误后去掉 --dry-run 执行蒸馏 → 将具体经验下沉到各域experiences.json"
                + (" | 建议同时运行 distill --from-stm 提炼短期记忆" if stm_lines > 10 else "")
            ),
        })
    elif stm_lines > 20:
        triggers.append({
            "id": "R4_STM_PENDING",
            "level": "info",
            "icon": "\U0001F4DD",  # 📝
            "message": f"short-term-memory.md积累了 {stm_lines} 行，可以提炼到MEMORY.md",
            "action": "运行 python3 evolution_guardian.py distill --from-stm 提炼短期记忆",
        })

    # ── 输出结果 ──
    if triggers:
        print(f"\n{'=' * 56}")
        print(f"  \U0001F9E0 进化阈值自检结果 [{domain}]")
        print(f"{'=' * 56}")
        for t in triggers:
            print(f"\n  {t['icon']} [{t['level'].upper()}] {t['message']}")
            print(f"  \u279C 行动指令: {t['action']}")
        print(f"\n{'=' * 56}")
        print(f"  \u26A0\ufe0f  以上指令为系统自动生成，请在本轮内响应。\n")

    return triggers


def cmd_archive_logs(days: int = 15, dry_run: bool = False):
    """★ v5.1: 每日日志归档 — 使用 _resolve_paths"""
    if days < 1:
        print(f"❌ --days 必须 >= 1（当前 {days}），否则会搬走今天的日志。已拒绝执行。")
        return

    paths = _resolve_paths()
    memory_dir = paths["memory_dir"]
    archive_dir = os.path.join(memory_dir, "archive")
    if not dry_run:
        os.makedirs(archive_dir, exist_ok=True)

    cutoff = datetime.now() - timedelta(days=days)
    archived = []
    skipped = []

    if not os.path.isdir(memory_dir):
        print(f"❌ memory目录不存在: {memory_dir}")
        return

    for fname in os.listdir(memory_dir):
        if not re.match(r"^\d{4}-\d{2}-\d{2}\.md$", fname):
            continue
        try:
            file_date = datetime.strptime(fname[:10], "%Y-%m-%d")
        except ValueError:
            continue

        if file_date < cutoff:
            src = os.path.join(memory_dir, fname)
            dst = os.path.join(archive_dir, fname)
            if os.path.exists(dst):
                dst = os.path.join(archive_dir, fname.replace(".md", f"_dup_{int(time.time())}.md"))
            if not dry_run:
                shutil.move(src, dst)
            archived.append(fname)
        else:
            skipped.append(fname)

    mode_tag = "🔍 DRY-RUN 预览" if dry_run else "📦 归档完成"
    print(f"\n{'=' * 50}")
    print(f"  {mode_tag}（>{days}天）")
    print(f"{'=' * 50}")
    print(f"  归档目录: {archive_dir}")
    print(f"  {'将要归档' if dry_run else '已归档'}: {len(archived)} 个文件")
    for f in archived:
        print(f"    {'➜' if dry_run else '✅'} {f}")
    print(f"  保留(≤{days}天): {len(skipped)} 个文件")
    if dry_run:
        print(f"  ℹ️  --dry-run 模式，未实际移动文件。去掉 --dry-run 以执行。")
    print(f"{'=' * 50}\n")


# ===== 命令实现 =====

# ===== 修改4: _scenario_exists 重写 =====

def _scenario_exists(experiences: list, new_scenario: str, new_insight: str = "") -> bool:
    """★ v5.1 重写: 单字级分词、85%阈值、短文本保护
    同时检查 scenario 和 insight 两个字段。
    """
    new_words = set(re.findall(r'[\u4e00-\u9fff]|[a-zA-Z]+|[0-9]+', new_scenario + " " + new_insight))
    if len(new_words) < 3:
        return False  # 短文本保护
    for exp in experiences:
        if exp.get("status", "active") != "active":
            continue
        existing_text = (exp.get("scenario", "") + " " + exp.get("insight", "")).strip()
        # 精确匹配
        if exp.get("scenario", "") == new_scenario:
            return True
        # 模糊匹配：单字级token重叠 >= 85%
        old_words = set(re.findall(r'[\u4e00-\u9fff]|[a-zA-Z]+|[0-9]+', existing_text))
        if old_words and new_words:
            overlap = len(new_words & old_words)
            ratio = overlap / min(len(new_words), len(old_words))
            if ratio >= 0.85:
                return True
    return False


def _detect_conflict(experiences: list, new_scenario: str, new_insight: str = "") -> dict:
    """★ v5.1 新增: 冲突检测（50-85%窗口）
    返回 {"conflicting_exp": exp, "overlap_ratio": float} 或 None
    """
    new_text = new_scenario + " " + new_insight
    new_words = set(re.findall(r'[\u4e00-\u9fff]|[a-zA-Z]+|[0-9]+', new_text))
    if len(new_words) < 3:
        return None

    for exp in experiences:
        if exp.get("status", "active") != "active":
            continue
        old_text = (exp.get("scenario", "") + " " + exp.get("insight", "")).strip()
        old_words = set(re.findall(r'[\u4e00-\u9fff]|[a-zA-Z]+|[0-9]+', old_text))
        if not old_words:
            continue
        overlap = len(new_words & old_words)
        ratio = overlap / min(len(new_words), len(old_words))
        # 冲突窗口：50-85%
        if 0.50 <= ratio < 0.85:
            return {"conflicting_exp": exp, "overlap_ratio": ratio}
    return None


# ===== 修改3: _append_lesson_to_domain 增加context+冲突检测+去重 =====

def _append_lesson_to_domain(domain: str, task: str, lesson: str,
                              error_type: str = "", error_cat: str = "",
                              trace: str = "", context: str = "") -> dict:
    """★ v5.1: 记录失败任务的教训 + 去重 + 冲突检测 + supersedes链"""
    evo_dir = _ensure_evo_dir(domain)
    ts = datetime.now().isoformat()

    # 1. 读取已有经验
    exp_file = os.path.join(evo_dir, "experiences.json")
    exp_data = _read_json(exp_file, {"schema_version": "5.1", "experiences": []})
    exps = exp_data.get("experiences", [])

    # 2. 去重检查 (>= 85%)
    if _scenario_exists(exps, task, lesson):
        print(f"  ⏭️  经验去重跳过（与已有经验>=85%重叠）: {task[:40]}...")
        return {"experience_id": None, "rule_id": None, "skipped_reason": "duplicate"}

    # 3. 冲突检测 (50-85%)
    conflict = _detect_conflict(exps, task, lesson)
    supersedes_ids = []
    if conflict:
        old_exp = conflict["conflicting_exp"]
        old_id = old_exp.get("id", "")
        old_exp["status"] = "deprecated"
        old_exp["deprecated_at"] = ts
        old_exp["deprecated_reason"] = f"被新经验替代（冲突窗口={conflict['overlap_ratio']:.0%}）"
        supersedes_ids.append(old_id)
        print(f"  ⚡ 冲突检测: 旧经验 {old_id} 已标记deprecated（重叠{conflict['overlap_ratio']:.0%}）")

    # 4. 写入新经验（★ v5.2: 使用 _extract_keywords 生成高质量keywords + 双语扩展）
    exp_id = f"lesson_{int(time.time()*1000)}_{len(exps)}"
    # 从任务描述+教训中提取关键词
    combined_text = f"{task} {lesson}"
    raw_keywords = _extract_keywords(combined_text)
    # 追加错误分类信息（如果有）
    for w in [error_cat, error_type]:
        if w and w.lower() not in [k.lower() for k in raw_keywords]:
            raw_keywords.append(w)
    # 双语扩展
    final_keywords = _expand_bilingual(raw_keywords)
    lang = _detect_language(combined_text)
    new_exp = {
        "id": exp_id,
        "status": "active",
        "layer": "L2",
        "scenario": task,
        "keywords": final_keywords,
        "lang": lang,
        "steps": [f"教训: {lesson}"],
        "insight": lesson,
        "trace": trace,
        "context": context,
        "why_failed": error_type if error_type else "",
        "confidence": 0.7,
        "proven_count": 1,
        "superseded_by": None,
        "supersedes": supersedes_ids,
        "source_task": task,
        "agent": "admin",
        "tags": ["from_log_lesson", "failure"],
        "timestamp": ts,
        "updated_at": ts,
    }
    exps.append(new_exp)
    exp_data["experiences"] = exps
    exp_data["total_count"] = len([e for e in exps if e.get("status", "active") == "active"])
    exp_data["last_updated"] = ts
    _write_json(exp_file, exp_data)

    # 5. 写入 immune_rules.json（自动生成预检规则）
    rule_file = os.path.join(evo_dir, "immune_rules.json")
    rule_data = _read_json(rule_file, {"schema_version": "5.1", "rules": []})
    rules = rule_data.get("rules", [])
    rule_id = f"rule_{int(time.time()*1000)}_{len(rules)}"
    rules.append({
        "id": rule_id,
        "scenario": task,
        "rule": lesson,
        "severity": "warning",
        "source_lesson": f"任务失败教训自动提取",
        "source_experience_id": exp_id,
        "error_type": error_type,
        "error_category": error_cat,
        "created_at": ts,
        "timestamp": ts,  # ★ v5.1 修改9: 增加timestamp字段
    })
    rule_data["rules"] = rules
    rule_data["total_rules"] = len(rules)
    rule_data["last_updated"] = ts
    _write_json(rule_file, rule_data)

    return {"experience_id": exp_id, "rule_id": rule_id}


# ===== 修改2+21+23: cmd_log 增强 =====

def cmd_log(domain, task, result, error_type, error_cat, tokens, duration,
            lesson="", trace="", context=""):
    """★ v5.1: 增加trace/context/自动域注册/耗时自动计算"""
    # ★ v5.0: 域校验 — 不存在则自动创建
    is_valid, hint = _validate_domain(domain)
    if not is_valid:
        evo_dir = _get_domain_dir(domain)
        try:
            os.makedirs(evo_dir, exist_ok=True)
            print(f"  🆕 自动创建域目录: {domain}")

            # ★ v5.1 修改21: 自动创建域时同步注册 index.json
            root = _find_project_root()
            index_file = os.path.join(root, "domains", "_shared", "index.json")
            index_data = _read_json(index_file, {"domains": {}})
            if domain not in index_data.get("domains", {}) and domain != "_shared":
                index_data["domains"][domain] = {
                    "trigger_keywords": [domain],
                    "anti_trigger_keywords": [],
                    "description": f"由log自动创建 ({datetime.now().strftime('%Y-%m-%d')})",
                    "auto_created": True,
                    "source": "log_auto_create",
                    "created_date": datetime.now().strftime("%Y-%m-%d"),
                }
                if "total_domains" in index_data:
                    index_data["total_domains"] = len(index_data["domains"])
                index_data["last_updated"] = datetime.now().isoformat()
                _write_json(index_file, index_data)
                print(f"  📋 已注册到Router: index.json (触发词: [{domain}])")
                print(f"  💡 提示: 可手动为该域添加更多触发词")
        except Exception as e:
            print(f"  ⚠️ 域'{domain}'不存在且创建失败: {e}，回退到 _shared")
            domain = "_shared"

    # ★ v5.1.1: Router签到检查 — 从 domains/_shared/ 读取令牌（IDE无关）
    _script_dir = Path(__file__).parent
    _token_file = _script_dir / ".active_task_token"
    _router_checked = False
    if _token_file.exists():
        try:
            with open(_token_file, "r", encoding="utf-8") as _tf:
                _tok_data = json.load(_tf)
            if str(datetime.now().strftime("%Y-%m-%d")) in _tok_data.get("time", ""):
                _router_checked = True
        except Exception:
            pass
    if not _router_checked:
        print("\n🔴🔴🔴 警告: 未检测到Router签到令牌! 你可能跳过了任务前domain_router.py调用!")
        print("   → 违反铁律1: 动手前必须先调router加载经验")
        print("   → 本次log仍会记录，但请确保下次先执行: python3 ./domains/_shared/domain_router.py \"<任务描述>\"")
        print()

    # 数值参数防御
    def _safe_int(v, default=0):
        if v is None or v == "":
            return default
        try:
            n = int(v)
            return max(n, 0)
        except (ValueError, TypeError):
            return default
    tokens = _safe_int(tokens, 0)
    duration = _safe_int(duration, 0)

    evo_dir = _ensure_evo_dir(domain)
    log_file = os.path.join(evo_dir, "evolution.log")
    mem_file = os.path.join(evo_dir, "memory.json")

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ★ v5.1 修改23: 耗时自动计算
    mem = _read_json(mem_file, {"statistics": {"total_tasks": 0, "success_count": 0, "failed_count": 0, "total_tokens": 0, "total_duration_sec": 0}, "recent_tasks": []})
    recent = mem.get("recent_tasks", [])

    if duration == 0 and recent:
        last_task = recent[-1] if recent else None
        if last_task and last_task.get("timestamp"):
            try:
                last_ts = datetime.strptime(last_task["timestamp"], "%Y-%m-%d %H:%M:%S")
                now = datetime.now()
                auto_duration = int((now - last_ts).total_seconds())
                if 1 <= auto_duration <= 7200:
                    duration = auto_duration
            except (ValueError, TypeError):
                pass

    # ★ v5.1 修改23: token显示优化
    token_display = str(tokens) if tokens > 0 else "N/A"
    log_line = (
        f"[{ts}] 任务完成 [domain:{domain}] task='{task}' result={result}"
        f" | Token消耗:{token_display} | 耗时:{duration}s"
    )
    if trace:
        log_line += f" | trace='{trace[:200]}'"
    if context:
        log_line += f" | context='{context[:200]}'"
    if lesson:
        log_line += f" | lesson='{lesson[:500]}'"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(log_line + "\n")

    # 更新memory.json统计
    stats = mem["statistics"]
    stats["total_tasks"] = stats.get("total_tasks", 0) + 1
    stats["total_tokens"] = stats.get("total_tokens", 0) + tokens
    stats["total_duration_sec"] = stats.get("total_duration_sec", 0) + duration
    if result == "success":
        stats["success_count"] = stats.get("success_count", 0) + 1
    elif result in ("failed", "partial"):
        stats["failed_count"] = stats.get("failed_count", 0) + 1

    # ★ v5.1: recent_tasks 增加 trace/context
    task_record = {"timestamp": ts, "task_desc": task, "result": result, "domain": domain}
    if trace:
        task_record["trace"] = trace[:200]
    if context:
        task_record["context"] = context[:200]
    recent.append(task_record)
    mem["recent_tasks"] = recent[-20:]
    _write_json(mem_file, mem)

    # ★ v5.1 修改5: 按任务类型分类统计（传入 error_cat）
    _update_task_type_stats(mem_file, task, result, error_cat=error_cat)

    print(f"\U0001F7E1 日志已记录 | agent=admin [domain:{domain}] task='{task}' result={result} | 耗时:{duration}s")

    # ★ v4.5: 如果传入了 lesson，自动写入 experiences + immune_rules
    if lesson:
        try:
            ids = _append_lesson_to_domain(domain, task, lesson, error_type, error_cat,
                                            trace=trace, context=context)
            if ids.get("experience_id"):
                print(f"  📚 经验已自动写入: experiences.json (id={ids['experience_id']})")
                print(f"  🛡️ 免疫规则已自动写入: immune_rules.json (id={ids['rule_id']}, severity=warning)")
            # 如果是 duplicate 跳过，上面已输出提示
        except Exception as e:
            print(f"  ⚠️  自动写入经验失败: {e}")

    # ★ v4.1: 自动阈值自检
    triggers = _auto_check_triggers(domain, mem_file, task, result)

    # ★ v5.1 修改8: R1触发改为异步subprocess（带日志）
    if triggers:
        for t in triggers:
            tid = t["id"]
            try:
                if "R1" in tid:
                    # R1: 异步轻量review
                    try:
                        import subprocess
                        script_path = os.path.abspath(os.path.join(SCRIPT_DIR, "evolution_guardian.py"))
                        log_dir = _resolve_paths()["memory_dir"]
                        review_log = os.path.join(log_dir, "auto-review.log")
                        with open(review_log, "a") as lf:
                            lf.write(f"\n[{ts}] R1 auto-review triggered for domain={domain}\n")
                            subprocess.Popen(
                                [sys.executable, script_path, "review", domain, "--auto"],
                                stdout=lf, stderr=lf,
                                cwd=_find_project_root()
                            )
                        print(f"  🔄 R1: 异步review已启动 (日志: {review_log})")
                    except Exception as e:
                        print(f"  ⚠️ 异步review启动失败({e})，回退同步执行")
                        cmd_review(domain, auto=True)
                elif "R2" in tid:
                    print(f"\n  🔴 {t['message']}")
                    cmd_review(domain, auto=False)
                elif "R3" in tid:
                    print(f"\n  ⚠️ {t['message']}")
                    print(f"  ➜ 行动指令: {t['action']}")
                elif "R4" in tid:
                    print(f"\n  📋 {t['message']}")
                    print(f"  ➜ 行动指令: {t['action']}")
            except Exception as e:
                print(f"  ⚠️ 触发器[{tid}]自动执行异常(非致命): {e}")

    if not triggers:
        return


def cmd_check(domain):
    """档位2: 自检诊断"""
    is_valid, hint = _validate_domain(domain)
    if not is_valid:
        print(hint)
        return

    evo_dir = _get_domain_dir(domain)
    mem = _read_json(os.path.join(evo_dir, "memory.json"), {})
    exp_file = os.path.join(evo_dir, "experiences.json")
    experiences = _read_json(exp_file, {}).get("experiences", [])
    rules_file = os.path.join(evo_dir, "immune_rules.json")
    rules = _read_json(rules_file, {}).get("rules", [])
    log_file = os.path.join(evo_dir, "evolution.log")
    log_lines = 0
    if os.path.exists(log_file):
        with open(log_file) as f:
            log_lines = sum(1 for _ in f)

    stats = mem.get("statistics", {})
    total = stats.get("total_tasks", 0)
    success = stats.get("success_count", 0)
    failed = stats.get("failed_count", 0)
    rate = (success / total * 100) if total > 0 else 100

    active_exps = [e for e in experiences if e.get("status", "active") == "active"]
    deprecated_exps = [e for e in experiences if e.get("status", "active") != "active"]
    l1 = sum(1 for e in active_exps if e.get("layer") == "L1")
    l2 = sum(1 for e in active_exps if e.get("layer") == "L2")
    l3 = sum(1 for e in active_exps if e.get("layer") == "L3")

    # ★ v5.1: 同时显示 resolved_paths 状态
    paths = _resolve_paths()

    print(f"\n{'='*60}")
    print(f"  Evolution Guardian v5.1 自检报告 [{domain}]")
    print(f"{'='*60}\n")
    print(f"  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  项目根: {paths.get('root', 'N/A')}")
    print(f"  Memory目录: {paths.get('memory_dir', 'N/A')}")
    print(f"\n  ── 1. 文件完整性 ──")
    for name, path in [("experiences.json", exp_file), ("evolution.log", log_file), ("immune_rules.json", rules_file)]:
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"  ✅ {name:<25} ({size:,} B)")
        else:
            print(f"  ❌ {name:<25} (缺失)")
    print(f"\n  ── 2. 经验库状态 ──")
    print(f"  有效经验(active): {len(active_exps)} | L1:{l1} L2:{l2} L3:{l3}")
    if deprecated_exps:
        print(f"  已废弃(deprecated): {len(deprecated_exps)} 条（不参与检索，保留归档）")
    print(f"\n  ── 3. 任务统计 ──")
    print(f"  总任务: {total} | 成功: {success} ({rate:.0f}%) | 失败: {failed}")

    ttc = mem.get("task_type_counts", {})
    if ttc:
        print(f"\n  ── 3b. 任务类型分布 ──")
        sorted_types = sorted(ttc.items(), key=lambda x: x[1].get("total", 0), reverse=True)
        for tkey, tdata in sorted_types[:8]:
            consec = tdata.get("consecutive_errors", 0)
            warn = f" \U0001F534 x{consec}" if consec >= 2 else ""
            print(f"    {tdata['total']:>3}次 [{tkey:<18}] S:{tdata.get('success',0)} F:{tdata.get('failed',0)}{warn}")
    else:
        print(f"\n  ── 3b. 任务类型分布 ── (暂无数据)")

    # ★ v5.1: error_cat 统计
    ecc = mem.get("error_cat_counts", {})
    if ecc:
        print(f"\n  ── 3c. 错误类别统计 ──")
        for cat, data in sorted(ecc.items(), key=lambda x: x[1].get("total_errors", 0), reverse=True):
            consec = data.get("consecutive_errors", 0)
            warn = f" 🔴 连续{consec}" if consec >= 2 else ""
            print(f"    {cat}: {data.get('total_errors',0)}次{warn}")

    print(f"\n  ── 5. 免疫系统 ──")
    print(f"  免疫规则: {len(rules)} 条")
    for r in rules[:5]:
        sev = r.get('severity', '?')
        print(f"    [{sev}] {r.get('scenario', '?')[:40]}")
    print(f"\n{'='*60}\n")


def cmd_experience_update(domain, old_id, new_id=None, action="deprecate"):
    """★ v4.2新增: 经验生命周期管理"""
    is_valid, hint = _validate_domain(domain)
    if not is_valid:
        print(hint)
        return False

    evo_dir = _get_domain_dir(domain)
    exp_file = os.path.join(evo_dir, "experiences.json")
    data = _read_json(exp_file, {"schema_version": "4.0", "experiences": []})
    experiences = data.get("experiences", [])

    target = next((e for e in experiences if e.get("id") == old_id), None)
    if not target:
        print(f"❌ 未找到 id='{old_id}' 的经验（域: {domain}）")
        print(f"   可用ID: {[e.get('id') for e in experiences[:10]]}")
        return False

    old_status = target.get("status", "active")
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if action == "deprecate":
        target["status"] = "deprecated"
        target["deprecated_at"] = ts
        target["deprecated_reason"] = "手动标记废弃"
        print(f"✅ 经验已废弃 | id={old_id} | 原status={old_status} → deprecated")
        print(f"   场景: {target.get('scenario', '?')}")

    elif action == "supersede":
        if not new_id:
            print(f"❌ supersede操作需要提供 new_id 参数")
            return False
        new_exp = next((e for e in experiences if e.get("id") == new_id), None)
        if not new_exp:
            print(f"❌ 替代经验 id='{new_id}' 不存在")
            return False
        target["status"] = "superseded"
        target["superseded_by"] = new_id
        target["superseded_at"] = ts
        print(f"✅ 经验已替代 | {old_id} → superseded_by={new_id}")

    else:
        print(f"❌ 未知操作: {action}，支持: deprecate / supersede")
        return False

    _write_json(exp_file, data)
    return True


def cmd_feedback(agent, ftype, severity, phrase, context):
    """反馈记录（全局）"""
    if not (agent and agent.strip()):
        print("❌ agent 不能为空")
        return
    if ftype not in ("negative", "positive", "neutral"):
        print(f"❌ type 必须是 negative/positive/neutral，当前: '{ftype}'")
        return
    if severity not in ("strong", "medium", "mild"):
        print(f"❌ severity 必须是 strong/medium/mild，当前: '{severity}'")
        return
    if not (phrase and phrase.strip()):
        print("❌ phrase 不能为空")
        return

    paths = _resolve_paths()
    fb_file = paths.get("feedback_file",
                        os.path.join(_find_project_root(), "domains", "_shared", "evo-feedback.json"))
    fb = _read_json(fb_file, {"schema_version": "4.0", "feedback_records": [], "trigger_words_config": {}})
    records = fb.get("feedback_records", [])
    records.append({
        "timestamp": datetime.now().isoformat(),
        "agent": agent.strip(), "type": ftype, "severity": severity,
        "phrase": phrase.strip(), "context": (context or "").strip(),
    })
    fb["feedback_records"] = records[-100:]
    _write_json(fb_file, fb)
    print(f"✅ 反馈已记录 | agent={agent} [{severity}] \"{phrase}\"")


def _extract_experiences_from_tasks(domain: str, auto: bool = False) -> dict:
    """★ v5.0+v5.1: 从最近任务日志中自动提取经验草案"""
    evo_dir = _get_domain_dir(domain)
    mem_file = os.path.join(evo_dir, "memory.json")
    mem = _read_json(mem_file, {})
    recent = mem.get("recent_tasks", [])

    log_file = os.path.join(evo_dir, "evolution.log")
    log_entries = []
    if os.path.exists(log_file):
        with open(log_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or not line.startswith('['):
                    continue
                try:
                    ts_part = line[1:].split(']', 1)[0] if ']' in line else ""
                    task_match = re.search(r"task='([^']*)'", line)
                    result_match = re.search(r'result=(\w+)', line)
                    lesson_match = re.search(r"lesson='([^']*)'", line) if 'lesson=' in line else None
                    trace_match = re.search(r"trace='([^']*)'", line) if 'trace=' in line else None
                    context_match = re.search(r"context='([^']*)'", line) if 'context=' in line else None
                    if task_match and result_match:
                        log_entries.append({
                            "timestamp": ts_part,
                            "task": task_match.group(1),
                            "result": result_match.group(1),
                            "lesson": lesson_match.group(1) if lesson_match else "",
                            "trace": trace_match.group(1) if trace_match else "",
                            "context": context_match.group(1) if context_match else "",
                        })
                except Exception:
                    continue

    all_tasks = {}
    for t in recent:
        key = (t.get("task_desc", ""), t.get("result", ""))
        if key[0]:
            all_tasks[key] = {
                "task_desc": t.get("task_desc", ""),
                "result": t.get("result", ""),
                "timestamp": t.get("timestamp", ""),
                "source": "memory",
                "trace": t.get("trace", ""),
                "context": t.get("context", ""),
            }
    for entry in log_entries:
        key = (entry["task"], entry["result"])
        if key not in all_tasks and key[0]:
            all_tasks[key] = {
                "task_desc": entry["task"],
                "result": entry["result"],
                "timestamp": entry["timestamp"],
                "source": "log",
                "lesson": entry["lesson"],
                "trace": entry.get("trace", ""),
                "context": entry.get("context", ""),
            }

    all_tasks_list = list(all_tasks.values())

    if not all_tasks_list:
        return {"new_experiences": [], "new_rules": [],
                "skipped_duplicates": 0, "skipped_insufficient": 0,
                "task_groups_analyzed": 0}

    groups = {}
    for t in all_tasks_list:
        tk = _normalize_task_type(t["task_desc"])
        groups.setdefault(tk, []).append(t)

    exp_file = os.path.join(evo_dir, "experiences.json")
    exp_data = _read_json(exp_file, {"experiences": []})
    existing_exps = exp_data.get("experiences", [])

    rule_file = os.path.join(evo_dir, "immune_rules.json")
    rule_data = _read_json(rule_file, {"rules": []})
    existing_rules = rule_data.get("rules", [])

    new_exps = []
    new_rules = []
    skipped_dup = 0
    skipped_insuff = 0
    ts = datetime.now().isoformat()

    for type_key, tasks in sorted(groups.items()):
        total = len(tasks)
        successes = [t for t in tasks if t["result"] == "success"]
        failures = [t for t in tasks if t["result"] in ("failed", "partial")]

        if total >= 2 and len(failures) == 0 and successes:
            scenario = f"[{type_key}] 成功模式(x{total}次)"
            insight = (
                f"该类操作在近期{total}次执行中全部成功。"
                f"典型任务: {'; '.join([t['task_desc'] for t in tasks[:2]])}。"
                f"可总结为可复用的标准操作流程。"
            )

            if _scenario_exists(existing_exps + new_exps, scenario, insight):
                skipped_dup += 1
                continue

            task_examples = [t["task_desc"] for t in tasks[:3]]
            exp_id = f"review_{int(time.time()*1000)}_{len(new_exps)}"
            # 提取trace信息
            traces = [t.get("trace", "") for t in tasks if t.get("trace")]
            # ★ v5.2: 从任务描述中提取高质量keywords + 双语扩展
            review_text = f"{type_key} {' '.join(task_examples[:2])}"
            review_keywords = _expand_bilingual(_extract_keywords(review_text))
            review_lang = _detect_language(review_text)
            new_exps.append({
                "id": exp_id,
                "status": "active",
                "layer": "L2",
                "scenario": scenario,
                "keywords": review_keywords,
                "lang": review_lang,
                "steps": [f"✅ {t['task_desc']}" for t in successes[:3]],
                "insight": insight,
                "trace": traces[0] if traces else "",
                "context": "",
                "why_failed": "",
                "confidence": round(min(0.5 + total * 0.15, 0.95), 2),
                "proven_count": total,
                "superseded_by": None,
                "supersedes": [],
                "source_task": "; ".join(task_examples[:2]),
                "agent": "auto-review",
                "tags": ["from_auto_review", "success_pattern"],
                "timestamp": ts,
                "updated_at": ts,
            })

        elif failures:
            fail_task = failures[0]["task_desc"]
            scenario = f"[{type_key}] 失败教训({fail_task})"
            lessons = [f.get("lesson", "").strip() for f in failures if f.get("lesson", "").strip()]

            if lessons:
                lesson_text = lessons[0]
                if len(lessons) > 1:
                    lesson_text += f" （另有{len(lessons)-1}条相关教训）"
            else:
                fail_details = "; ".join([f['task_desc'] for f in failures[:3]])
                lesson_text = (
                    f"[{type_key}] 该类操作出现{len(failures)}次失败: {fail_details}。"
                    f"建议分析失败根因后用 --lesson 参数记录具体教训。"
                )

            if _scenario_exists(existing_exps + new_exps, scenario, lesson_text):
                skipped_dup += 1
                continue

            exp_id = f"review_{int(time.time()*1000)}_{len(new_exps)}"
            traces = [f.get("trace", "") for f in failures if f.get("trace")]
            contexts = [f.get("context", "") for f in failures if f.get("context")]
            # ★ v5.2: 从失败任务中提取高质量keywords + 双语扩展
            fail_review_text = f"{type_key} {fail_task} {lesson_text[:50]}"
            fail_keywords = _expand_bilingual(_extract_keywords(fail_review_text))
            if "failure" not in [k.lower() for k in fail_keywords]:
                fail_keywords.append("failure")
                fail_keywords.append("失败")
            fail_lang = _detect_language(fail_review_text)
            new_exps.append({
                "id": exp_id,
                "status": "active",
                "layer": "L2",
                "scenario": scenario,
                "keywords": fail_keywords,
                "lang": fail_lang,
                "steps": [f"❌ 失败: {f['task_desc']}" for f in failures[:2]],
                "insight": lesson_text,
                "trace": traces[0] if traces else "",
                "context": contexts[0] if contexts else "",
                "why_failed": "pattern_failure",
                "confidence": 0.8,
                "proven_count": total,
                "superseded_by": None,
                "supersedes": [],
                "source_task": fail_task,
                "agent": "auto-review",
                "tags": ["from_auto_review", "failure_lesson"],
                "timestamp": ts,
                "updated_at": ts,
            })

            if lessons and not any(
                r.get("rule", "") == lesson_text.split(',')[0][:50]
                for r in existing_rules + new_rules
            ):
                rule_id = f"rule_review_{int(time.time()*1000)}_{len(new_rules)}"
                new_rules.append({
                    "id": rule_id,
                    "scenario": scenario,
                    "rule": lesson_text,
                    "severity": "warning",
                    "source_lesson": f"auto-review从{total}次任务中提取",
                    "source_experience_id": exp_id,
                    "error_type": "pattern_failure",
                    "error_category": type_key[:20],
                    "created_at": ts,
                    "timestamp": ts,
                })

        else:
            skipped_insuff += 1

    written_exp_ids = []
    if new_exps:
        all_exps = existing_exps + new_exps
        exp_data["experiences"] = all_exps
        exp_data["total_count"] = len([e for e in all_exps if e.get("status", "active") == "active"])
        exp_data["last_updated"] = ts
        _write_json(exp_file, exp_data)
        written_exp_ids = [e["id"] for e in new_exps]

    if new_rules:
        all_rules = existing_rules + new_rules
        rule_data["rules"] = all_rules
        rule_data["total_rules"] = len(all_rules)
        rule_data["last_updated"] = ts
        _write_json(rule_file, rule_data)

    return {
        "new_experiences": new_exps,
        "new_rules": new_rules,
        "skipped_duplicates": skipped_dup,
        "skipped_insufficient": skipped_insuff,
        "task_groups_analyzed": len(groups),
        "written_exp_ids": written_exp_ids,
    }


# ===== 修改12: review增加Skill生成提议 =====

def cmd_review(domain, auto=False):
    """★ v5.1: 复盘 + Skill生成提议"""
    is_valid, hint = _validate_domain(domain)
    if not is_valid:
        evo_dir = _get_domain_dir(domain)
        try:
            os.makedirs(evo_dir, exist_ok=True)
            print(f"  🆕 域'{domain}'不存在但已自动创建目录（尚无经验数据可review）")
            return
        except Exception:
            print(hint)
            return

    result = _extract_experiences_from_tasks(domain, auto=auto)

    n_exp = len(result["new_experiences"])
    n_rule = len(result["new_rules"])
    n_dup = result["skipped_duplicates"]
    n_insuff = result["skipped_insufficient"]
    n_groups = result["task_groups_analyzed"]

    if auto:
        if n_exp > 0 or n_rule > 0:
            print(f"\n🔄 Auto-Review [{domain}]: "
                  f"+{n_exp}条经验, +{n_rule}条免疫规则 "
                  f"(分析{n_groups}组任务, 去重跳过{n_dup}组)")
            if result.get("written_exp_ids"):
                print(f"   经验ID: {', '.join(result['written_exp_ids'][:3])}")
        else:
            print(f"\n🔄 Auto-Review [{domain}]: 无新经验可提取"
                  f"(分析{n_groups}组, 样本不足{n_insuff}/去重{n_dup})")
        return

    # 手动模式：详细报告
    print(f"\n{'='*60}")
    print(f"  📋 复盘报告 [{domain}]  v5.1 自动经验提取")
    print(f"{'='*60}")
    print(f"\n  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  任务组数: {n_groups}")
    print(f"  结果:")
    print(f"    ✅ 新增经验: {n_exp} 条")
    print(f"    ✅ 新增免疫规则: {n_rule} 条")
    print(f"    ⏭️  去重跳过: {n_dup} 组（与已有经验重叠）")
    print(f"    ⏭️  样本不足: {n_insuff} 组（仅1次或混合结果）")

    if result["new_experiences"]:
        print(f"\n  ── 新增经验详情 ──")
        for i, exp in enumerate(result["new_experiences"], 1):
            layer_icon = {"L1": "📝", "L2": "🔧", "L3": "🧠"}.get(exp.get("layer", "L2"), "📋")
            tag_badge = ", ".join(exp.get("tags", [])[:2])
            print(f"\n    {i}. {layer_icon} [{exp.get('id', '?')}] {exp.get('scenario', '?')[:50]}")
            print(f"       置信度: {exp.get('confidence', '?')} | 验证次数: {exp.get('proven_count', 0)}")
            print(f"       标签: [{tag_badge}]")
            insight = exp.get("insight", "")
            if insight:
                display_insight = insight if len(insight) <= 120 else insight[:120] + "..."
                print(f"       洞察: {display_insight}")

    if result["new_rules"]:
        print(f"\n  ── 新增免疫规则 ──")
        for i, rule in enumerate(result["new_rules"], 1):
            sev_icon = {"critical": "🔴", "warning": "🟡", "info": "🔵"}.get(rule.get("severity", "warning"), "⚪")
            rule_text = rule.get("rule", "")
            display_rule = rule_text if len(rule_text) <= 100 else rule_text[:100] + "..."
            print(f"    {i}. {sev_icon} [{rule.get('id', '?')}] {display_rule}")

    # 推荐动作
    print(f"\n  ── 推荐动作 ──")
    actions = []
    if n_exp > 0:
        actions.append(f"✅ {n_exp}条新经验已写入，下次 Router 加载时自动生效")
    if n_rule > 0:
        actions.append(f"✅ {n_rule}条新免疫规则已写入，下次任务前自动预检")
    if n_dup > 0:
        actions.append(f"ℹ️  {n_dup}组因与已有经验重叠而跳过")
    if n_insuff > 0:
        actions.append(f"💡 {n_insuff}组任务样本不足，继续积累后下次review再评估")
    if n_exp == 0 and n_rule == 0:
        actions.append("✅ 该域当前无需新经验")
    actions.append("💡 定期运行: log每3次自动触发R1→auto-review")

    # ★ v5.1 修改12: Skill生成提议
    evo_dir = _get_domain_dir(domain)
    exp_file = os.path.join(evo_dir, "experiences.json")
    exp_data = _read_json(exp_file, {"experiences": []})
    active_count = len([e for e in exp_data.get("experiences", []) if e.get("status", "active") == "active"])
    if active_count >= 5:
        actions.append(f"🔧 建议: 该域已有{active_count}条active经验，可考虑合并为SKILL.md（结构化可复用）")

    for a in actions:
        print(f"    {a}")

    print(f"\n{'='*60}\n")


def cmd_evolve(domain, reason=""):
    """深度进化体检"""
    is_valid, hint = _validate_domain(domain)
    if not is_valid:
        print(hint)
        return

    print(f"\n{'=' * 60}")
    print(f"  🧬 深度进化体检 [{domain}]  reason={reason or '(手动触发)'}")
    print(f"{'=' * 60}")

    root = _find_project_root()
    domain_dir = _get_domain_dir(domain)

    paths = _resolve_paths()
    fb_file = paths.get("feedback_file", os.path.join(root, "domains", "_shared", "evo-feedback.json"))
    fb = _read_json(fb_file, {"feedback_records": []})
    unresolved = [f for f in fb.get("feedback_records", [])
                  if f.get("type") == "negative"
                  and f.get("status") != "resolved"
                  and (f.get("phrase") or "").strip()]
    print(f"\n  ── ① 未处理负面反馈 ({len(unresolved)} 条) ──")
    if not unresolved:
        print("    ✅ 无未处理负反馈")
    else:
        for f in unresolved[-5:]:
            print(f"    ⚠️  [{f.get('timestamp', '?')}] severity={f.get('severity', '?')}")
            print(f"        phrase: {f.get('phrase', '')[:80]}")

    exp_file = os.path.join(domain_dir, "experiences.json")
    exp = _read_json(exp_file, {"experiences": []})
    exps = exp.get("experiences", [])
    active = [e for e in exps if e.get("status", "active") == "active"]
    layers = {"L1": 0, "L2": 0, "L3": 0}
    scenarios = {}
    for e in active:
        layers[e.get("layer", "L2")] = layers.get(e.get("layer", "L2"), 0) + 1
        s = e.get("scenario", "")
        scenarios[s] = scenarios.get(s, 0) + 1
    dup_scenarios = {k: v for k, v in scenarios.items() if v > 1}
    print(f"\n  ── ② 经验库体检 ──")
    print(f"    总经验: {len(exps)} | 有效: {len(active)} | L1:{layers['L1']} L2:{layers['L2']} L3:{layers['L3']}")
    if dup_scenarios:
        print(f"    ⚠️  重复 scenario ({len(dup_scenarios)} 组):")
        for s, c in list(dup_scenarios.items())[:3]:
            print(f"        {c}x {s[:60]}")

    rule_file = os.path.join(domain_dir, "immune_rules.json")
    rules = _read_json(rule_file, {"rules": []})
    rs = rules.get("rules", [])
    critical = [r for r in rs if r.get("severity") == "critical"]
    print(f"\n  ── ③ 免疫规则体检 ──")
    print(f"    总规则: {len(rs)} | critical: {len(critical)} | warning: {len(rs) - len(critical)}")

    print(f"\n  ── ④ 推荐进化动作 ──")
    rec_actions = []
    if unresolved:
        rec_actions.append(f"处理 {len(unresolved)} 条未处理负反馈")
    if dup_scenarios:
        rec_actions.append(f"合并 {len(dup_scenarios)} 组重复 scenario 经验")
    if not rec_actions:
        rec_actions.append("✅ 体检通过，暂无紧急进化动作")
    for i, a in enumerate(rec_actions, 1):
        print(f"    {i}. {a}")
    print(f"\n{'=' * 60}\n")


# ===== 修改10: 新增 hot-experiences 子命令 =====

def cmd_hot_experiences(count: int = 5):
    """★ v5.1 新增: 输出所有域中最高价值经验（供session初始化上下文注入）
    排序：layer优先级(L3>L2>L1) + confidence降序 + proven_count降序
    """
    root = _find_project_root()
    domains_dir = os.path.join(root, "domains")
    if not os.path.isdir(domains_dir):
        print("❌ domains目录不存在")
        return

    all_exps = []
    for d in os.listdir(domains_dir):
        d_path = os.path.join(domains_dir, d)
        if not os.path.isdir(d_path) or d.startswith("."):
            continue
        exp_file = os.path.join(d_path, "experiences.json")
        if d == "_shared":
            exp_file = os.path.join(d_path, "admin-experiences.json")
        if not os.path.exists(exp_file):
            continue
        data = _read_json(exp_file, {"experiences": []})
        exps = data.get("experiences", []) if isinstance(data, dict) else data
        for e in exps:
            if e.get("status", "active") == "active":
                e["_domain"] = d
                all_exps.append(e)

    if not all_exps:
        print("ℹ️  无活跃经验可输出")
        return

    layer_order = {"L3": 3, "L2": 2, "L1": 1}
    all_exps.sort(key=lambda e: (
        layer_order.get(e.get("layer", "L2"), 0),
        e.get("confidence", 0),
        e.get("proven_count", 0),
    ), reverse=True)

    top = all_exps[:count]
    print(f"\n{'='*60}")
    print(f"  🔥 Hot Experiences (Top {count})")
    print(f"{'='*60}")
    for i, e in enumerate(top, 1):
        layer = e.get("layer", "L2")
        conf = e.get("confidence", 0)
        proven = e.get("proven_count", 0)
        domain = e.get("_domain", "?")
        print(f"\n  {i}. [{domain}] {layer} | conf={conf} | proven={proven}")
        print(f"     {e.get('scenario', '?')[:80]}")
        insight = e.get("insight", "")
        if insight:
            print(f"     → {insight[:120]}")
    print(f"\n{'='*60}\n")


# ===== 修改11: 新增 decay 子命令 =====

def cmd_decay(dry_run: bool = False):
    """★ v5.1 新增: 经验置信度衰减
    条件：创建>30天 且 proven_count<=1
    操作：confidence -= 0.1
    达到<=0.3时标记deprecated
    """
    root = _find_project_root()
    domains_dir = os.path.join(root, "domains")
    now = datetime.now()
    total_decayed = 0
    total_deprecated = 0

    print(f"\n{'='*60}")
    print(f"  🍂 经验衰减 {'[DRY-RUN]' if dry_run else '[执行模式]'}")
    print(f"{'='*60}")

    for d in sorted(os.listdir(domains_dir)):
        d_path = os.path.join(domains_dir, d)
        if not os.path.isdir(d_path) or d.startswith("."):
            continue
        exp_file = os.path.join(d_path, "experiences.json")
        if d == "_shared":
            exp_file = os.path.join(d_path, "admin-experiences.json")
        if not os.path.exists(exp_file):
            continue

        data = _read_json(exp_file, {"experiences": []})
        if isinstance(data, list):
            exps = data
        else:
            exps = data.get("experiences", [])
        changed = False

        for e in exps:
            if not isinstance(e, dict):
                continue
            if e.get("status", "active") != "active":
                continue
            # 检查创建时间
            ts_str = e.get("timestamp", "")
            if not ts_str or not isinstance(ts_str, str):
                continue
            try:
                created = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                age_days = (now - created.replace(tzinfo=None)).days
            except (ValueError, TypeError):
                continue

            proven = e.get("proven_count", 0)
            conf = e.get("confidence", 0.5)

            if age_days > 30 and proven <= 1:
                old_conf = conf
                new_conf = round(conf - 0.1, 2)

                if new_conf <= 0.3:
                    if not dry_run:
                        e["status"] = "deprecated"
                        e["deprecated_at"] = now.isoformat()
                        e["deprecated_reason"] = f"衰减废弃: confidence从{old_conf}降至{new_conf}, 超过30天未验证"
                        e["confidence"] = new_conf
                    total_deprecated += 1
                    print(f"  🗑️  [{d}] {e.get('id','')} conf:{old_conf}→{new_conf} → DEPRECATED (age:{age_days}d)")
                    changed = True
                else:
                    if not dry_run:
                        e["confidence"] = new_conf
                    total_decayed += 1
                    print(f"  📉 [{d}] {e.get('id','')} conf:{old_conf}→{new_conf} (age:{age_days}d, proven:{proven})")
                    changed = True

        if changed and not dry_run:
            _write_json(exp_file, data)

    print(f"\n  衰减: {total_decayed}条 | 废弃: {total_deprecated}条")
    if dry_run:
        print(f"  ℹ️  DRY-RUN模式，未实际修改。去掉 --dry-run 以执行。")
    print(f"{'='*60}\n")


# ===== MEMORY.md 生命周期管理 =====

_FALLBACK_DOMAIN_KEYWORDS = {
    "data":    ["数据", "查询", "SQL", "excel", "爬虫", "数据库", "统计", "分析", "表格", "报表"],
    "product": ["需求", "PRD", "产品", "功能", "设计", "文档", "流程", "用户故事", "迭代", "版本"],
    "ux":      ["交互", "UI", "界面", "原型", "设计稿", "用户体验", "前端", "组件", "样式", "布局"],
    "test":    ["测试", "QA", "验证", "用例", "回归", "bug", "缺陷", "质量"],
    "skilldev":["skill", "技能", "SKILL.md", "架构", "脚本", "部署", "自进化"],
}

_META_LAYER_PATTERNS = [
    r"^#+\s*(沟通规范|运行模式|架构.*概览|当前版本|沟通.*规则|身份.*定义)",
    r"唯一.*模式|已停用|恢复条件",
    r"称呼用户|称用户为|沟通风格|对话风格",
    r"最后更新.*\d{4}-\d{2}-\d{2}",
    r"^---\s*$",
]


def _load_domain_keyword_map(root: str) -> dict:
    """从evo-config.json加载域关键词映射"""
    cfg_path = os.path.join(root, "domains", "_shared", "evo-config.json")
    cfg = _read_json(cfg_path, {})
    domains_raw = cfg.get("domains", {})
    domain_map = {}

    if isinstance(domains_raw, list):
        for d in domains_raw:
            key = d.get("key", "")
            kws = d.get("trigger_keywords", [])
            if key and kws:
                domain_map[key] = kws
    elif isinstance(domains_raw, dict):
        index_path = os.path.join(root, "domains", "_shared", "index.json")
        index = _read_json(index_path, {})
        index_domains = index.get("domains", {})
        for key in domains_raw:
            kws = index_domains.get(key, {}).get("trigger_keywords", [])
            if not kws:
                kws = _FALLBACK_DOMAIN_KEYWORDS.get(key, [])
            if kws:
                domain_map[key] = kws

    if not domain_map:
        domain_map = _FALLBACK_DOMAIN_KEYWORDS
    return domain_map


def _is_meta_layer(line: str) -> bool:
    for pat in _META_LAYER_PATTERNS:
        if re.search(pat, line):
            return True
    return False


def _classify_block_to_domain(block_text: str, domain_map: dict) -> tuple:
    """v4.4增强: 将一段MEMORY文本归类到最匹配的域"""
    text_lower = block_text.lower()
    scores = {}
    for domain, kws in domain_map.items():
        score = sum(1 for kw in kws if kw.lower() in text_lower)
        if score > 0:
            scores[domain] = score
    if not scores:
        return None, False

    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    best_domain = sorted_scores[0][0]
    best_score = sorted_scores[0][1]

    is_cross = (
        best_score >= 2 and
        len(sorted_scores) >= 2 and
        sorted_scores[1][1] > 0 and
        sorted_scores[1][1] >= best_score * 0.7
    )
    return best_domain, is_cross


def _append_experience_to_domain(root: str, domain: str, scenario: str, content: str, source: str):
    """把提炼出的内容写入域experiences.json"""
    domain_dir = os.path.join(root, "domains", domain)
    os.makedirs(domain_dir, exist_ok=True)
    exp_file = os.path.join(domain_dir, "experiences.json")
    data = _read_json(exp_file, {"schema_version": "1.0", "experiences": []})
    exps = data.get("experiences", [])

    new_id = f"distilled_{int(time.time()*1000)}_{len(exps)}"
    ts = datetime.now().isoformat()
    # ★ v5.2: 从scenario+content中提取keywords + 双语扩展 + 语种标记
    distill_text = f"{scenario} {content[:100]}"
    distill_keywords = _expand_bilingual(_extract_keywords(distill_text))
    distill_lang = _detect_language(distill_text)
    exps.append({
        "id": new_id,
        "layer": "L2",
        "timestamp": ts,
        "scenario": scenario,
        "keywords": distill_keywords,
        "lang": distill_lang,
        "steps": [content],
        "proven": False,
        "confidence": 0.6,
        "source_task": f"distill from MEMORY.md ({source})",
        "agent": "admin",
        "tags": ["distilled", "from_memory"],
        "status": "active",
    })
    data["experiences"] = exps
    data["total_count"] = len(exps)
    data["last_updated"] = ts
    _write_json(exp_file, data)
    return new_id


def _safe_write_memory(memory_path: str, new_content: str) -> bool:
    """MEMORY.md 原子写入"""
    tmp = f"{memory_path}.tmp.{os.getpid()}"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(new_content.rstrip() + "\n")
            f.flush()
            try:
                os.fsync(f.fileno())
            except (OSError, AttributeError):
                pass
        os.replace(tmp, memory_path)
        return True
    except Exception as e:
        sys.stderr.write(f"⚠️  MEMORY.md 原子写入失败: {e}\n")
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except Exception:
                pass
        return False


# ===== 修改13: distill系列路径统一 =====

def cmd_distill(memory_path: str = None, dry_run: bool = False, from_stm: bool = False):
    """★ v5.1: 使用 _resolve_paths 统一路径"""
    root = _find_project_root()
    paths = _resolve_paths()

    if from_stm:
        _cmd_distill_from_stm(root, dry_run)
        return

    if not memory_path:
        memory_path = paths.get("memory_file")
        if not memory_path or not os.path.exists(memory_path):
            candidates = [
                os.path.join(root, "memory", "MEMORY.md"),
                os.path.join(root, "MEMORY.md"),
            ]
            memory_path = next((p for p in candidates if os.path.exists(p)), None)

    if not memory_path or not os.path.exists(memory_path):
        print(f"❌ 未找到MEMORY.md")
        return

    domain_map = _load_domain_keyword_map(root)

    with open(memory_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.splitlines()
    total_lines = len(lines)

    print(f"\n{'=' * 60}")
    print(f"  🧹 MEMORY.md 蒸馏 {'[预览模式]' if dry_run else '[执行模式]'}")
    print(f"{'=' * 60}")
    print(f"  文件: {memory_path}")
    print(f"  当前行数: {total_lines}")

    PINNED_END = "<!-- PINNED_SECTION_END -->"
    pinned_content = ""
    distillable_content = content

    if PINNED_END in content:
        parts = content.split(PINNED_END, 1)
        pinned_content = parts[0] + PINNED_END
        distillable_content = parts[1]
        pinned_lines = len(pinned_content.splitlines())
        print(f"  🔒 置顶保护区: {pinned_lines} 行（跳过，不蒸馏）")
        print(f"  📋 可蒸馏区: {total_lines - pinned_lines} 行")
    else:
        print(f"  ℹ️  未检测到置顶保护区")

    lines = distillable_content.splitlines()

    blocks = []
    current_block_lines = []
    current_heading = ""

    for line in lines:
        if re.match(r'^#{1,3}\s+', line):
            if current_block_lines:
                blocks.append({
                    "heading": current_heading,
                    "lines": current_block_lines,
                    "text": "\n".join(current_block_lines),
                })
            current_heading = line
            current_block_lines = [line]
        else:
            current_block_lines.append(line)

    if current_block_lines:
        blocks.append({
            "heading": current_heading,
            "lines": current_block_lines,
            "text": "\n".join(current_block_lines),
        })

    to_distill = []
    to_keep = []
    to_shared = []

    META_HEADINGS = [
        "沟通规范", "运行模式", "当前版本", "架构概览", "长期记忆",
        "批判性思维", "核心操作纪律", "自进化v4", "SKILL相关",
        "已下沉经验索引", "self-evolving-core 记忆规则",
    ]

    for block in blocks:
        heading_text = block["heading"]
        block_text = block["text"]
        block_lines = len(block["lines"])

        is_meta = (
            block_lines <= 3 or
            any(kw in heading_text for kw in META_HEADINGS) or
            _is_meta_layer(heading_text)
        )

        if is_meta:
            to_keep.append(block)
            continue

        target_domain, is_cross = _classify_block_to_domain(block_text, domain_map)

        if is_cross:
            to_shared.append({"block": block, "domain": "_shared"})
        elif target_domain and os.path.isdir(os.path.join(root, "domains", target_domain)):
            to_distill.append({"block": block, "domain": target_domain})
        else:
            to_keep.append(block)

    print(f"\n  分析结果:")
    print(f"  ✅ 保留元层: {len(to_keep)} 个块")
    print(f"  ⬇️  单域下沉: {len(to_distill)} 个块")
    print(f"  🔀 跨域→_shared: {len(to_shared)} 个块\n")

    all_to_move = to_distill + to_shared

    if not all_to_move:
        print(f"  ℹ️  无需蒸馏，MEMORY.md已是精简状态。")
        return

    for item in all_to_move:
        b = item["block"]
        d = item["domain"]
        label = "[_shared跨域]" if d == "_shared" else f"[{d}]"
        preview = b["text"][:100].replace("\n", " ")
        print(f"  ⬇️  {label} {b['heading']}")
        print(f"       预览: {preview}...")
        print()

    if dry_run:
        print(f"  [预览模式] 以上内容将被下沉。去掉 --dry-run 执行。")
        return

    distilled_count = 0
    pointer_lines = []

    for item in all_to_move:
        b = item["block"]
        d = item["domain"]
        scenario = b["heading"].lstrip("#").strip()
        exp_id = _append_experience_to_domain(root, d, scenario, b["text"], "MEMORY.md")
        distilled_count += 1
        domain_label = "_shared(跨域)" if d == "_shared" else d
        pointer_lines.append(
            f"- **{scenario}**: 已下沉到 `domains/{d}/` (id: {exp_id})\n"
        )
        print(f"  ✅ 已下沉 → [{domain_label}] {scenario[:40]} (id: {exp_id})")

    kept_text = "\n".join(
        "\n".join(b["lines"]) for b in to_keep
    ).rstrip()

    pointer_section = "\n\n## 📍 已下沉经验索引\n\n" + "".join(pointer_lines) if pointer_lines else ""

    if pinned_content:
        new_content = pinned_content + "\n" + kept_text.lstrip("\n") + pointer_section + "\n"
    else:
        new_content = kept_text + pointer_section + "\n"

    new_lines = len(new_content.splitlines())

    success = _safe_write_memory(memory_path, new_content)

    print(f"\n{'=' * 60}")
    if success:
        print(f"  🎉 蒸馏完成!")
        print(f"  下沉条数: {distilled_count}（其中跨域→_shared: {len(to_shared)}条）")
        print(f"  MEMORY.md: {total_lines}行 → {new_lines}行")
        print(f"  目标: <200行 | 当前: {new_lines}行 {'✅' if new_lines <= 200 else '⚠️ 仍超目标'}")
    else:
        print(f"  ❌ 写入失败！")
    print(f"{'=' * 60}\n")


def _cmd_distill_from_stm(root: str, dry_run: bool = False):
    """★ v5.1: 使用 _resolve_paths 统一路径"""
    paths = _resolve_paths()
    stm_path = paths.get("stm_file", os.path.join(root, "memory", "short-term-memory.md"))
    memory_path = paths.get("memory_file", os.path.join(root, "memory", "MEMORY.md"))

    if not os.path.exists(stm_path):
        print(f"  ℹ️  short-term-memory.md不存在: {stm_path}")
        return

    with open(stm_path, "r", encoding="utf-8") as f:
        stm_content = f.read()

    STM_BOUNDARY = "<!-- STM_BOUNDARY:"

    if STM_BOUNDARY in stm_content:
        boundary_idx = stm_content.index(STM_BOUNDARY)
        new_section = stm_content[:boundary_idx]
        archived_section = stm_content[boundary_idx:]
    else:
        new_section = stm_content
        archived_section = ""

    meaningful_lines = [
        l for l in new_section.splitlines()
        if l.strip()
        and l.strip() != "---"
        and not l.startswith("# 短期记忆")
        and not l.strip().startswith("<!--")
    ]

    print(f"\n{'=' * 60}")
    print(f"  📝 短期记忆提炼 {'[预览模式]' if dry_run else '[执行模式]'}")
    print(f"{'=' * 60}")
    print(f"  STM文件: {stm_path}")
    total_lines = len(stm_content.splitlines())
    new_area_lines = len(new_section.splitlines())
    print(f"  总行数: {total_lines} | 新内容区: {new_area_lines} 行 | 待提炼: {len(meaningful_lines)} 行")

    if not meaningful_lines:
        print(f"  ℹ️  新内容区为空。")
        return

    print(f"\n  待提炼内容预览（前5行）:")
    for l in meaningful_lines[:5]:
        print(f"    {l[:80]}")
    if len(meaningful_lines) > 5:
        print(f"    ... 共{len(meaningful_lines)}行")

    if dry_run:
        print(f"\n  [预览模式] 去掉 --dry-run 执行。")
        return

    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    insert_block = (
        f"\n## 📥 短期记忆提炼 ({ts})\n\n"
        + "\n".join(meaningful_lines)
        + "\n"
    )

    existing_memory = ""
    if os.path.exists(memory_path):
        with open(memory_path, "r", encoding="utf-8") as f:
            existing_memory = f.read()

    PINNED_END = "<!-- PINNED_SECTION_END -->"
    if PINNED_END in existing_memory:
        parts = existing_memory.split(PINNED_END, 1)
        new_memory = parts[0] + PINNED_END + insert_block + parts[1].lstrip("\n")
    else:
        new_memory = existing_memory.rstrip() + insert_block

    success = _safe_write_memory(memory_path, new_memory)

    if success:
        new_boundary_line = f"<!-- STM_BOUNDARY: 上次提炼 {ts} | {len(meaningful_lines)} 行已提炼到MEMORY.md -->\n"
        if archived_section:
            old_archive_body = archived_section.split("\n", 1)[1] if "\n" in archived_section else ""
            new_archived = new_boundary_line + old_archive_body
        else:
            new_archived = new_boundary_line

        stm_header = "# 短期记忆（临时缓冲区）\n\n> 新内容请写到分界线以上。提炼命令：`python3 domains/_shared/evolution_guardian.py distill --from-stm`\n\n---\n"
        new_stm = stm_header + new_archived

        with open(stm_path, "w", encoding="utf-8") as f:
            f.write(new_stm)

        print(f"\n  ✅ 提炼完成! 已提炼 {len(meaningful_lines)} 行到 MEMORY.md")
        mem_lines = len(new_memory.splitlines())
        print(f"  MEMORY.md当前: {mem_lines} 行 {'⚠️ 超200行' if mem_lines > 200 else '✅'}")
    else:
        print(f"\n  ❌ 写入失败！")

    print(f"{'=' * 60}\n")


def _cmd_distill_from_daily(root: str, date_str: str = None, dry_run: bool = False):
    """★ v5.1: 使用 _resolve_paths 统一路径"""
    paths = _resolve_paths()
    memory_dir = paths["memory_dir"]
    stm_path = paths.get("stm_file", os.path.join(memory_dir, "short-term-memory.md"))

    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
    else:
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            print(f"❌ --date 格式错误: '{date_str}'，必须是 YYYY-MM-DD")
            return
    daily_path = os.path.join(memory_dir, f"{date_str}.md")

    print(f"\n{'=' * 60}")
    print(f"  📅 每日日志→STM 提炼 {'[预览模式]' if dry_run else '[执行模式]'}")
    print(f"{'=' * 60}")
    print(f"  日志文件: {daily_path}")
    print(f"  目标STM: {stm_path}")

    if not os.path.exists(daily_path):
        print(f"  ❌ 日志文件不存在: {daily_path}")
        try:
            available = [f for f in os.listdir(memory_dir) if f.endswith('.md') and f[0].isdigit()]
            if available:
                print(f"     可用日志: {available}")
        except Exception:
            pass
        return

    with open(daily_path, "r", encoding="utf-8") as f:
        daily_content = f.read()

    daily_lines = daily_content.splitlines()
    print(f"  日志行数: {len(daily_lines)} 行")

    value_blocks = []
    current_heading = ""
    current_lines = []

    SKIP_PATTERNS = [
        r"^## session启动",
        r"^## 任务记录\s*$",
        r"^# \d{4}-\d{2}-\d{2}",
    ]

    for line in daily_lines:
        if re.match(r'^#{1,3}\s+', line):
            if current_lines and current_heading:
                content_lines = [l for l in current_lines if l.strip()]
                is_skip = any(re.match(pat, current_heading, re.IGNORECASE) for pat in SKIP_PATTERNS)
                if len(content_lines) >= 3 and not is_skip:
                    value_blocks.append({
                        "heading": current_heading,
                        "lines": current_lines,
                        "text": "\n".join(current_lines),
                    })
            current_heading = line
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_lines and current_heading:
        content_lines = [l for l in current_lines if l.strip()]
        is_skip = any(re.match(pat, current_heading, re.IGNORECASE) for pat in SKIP_PATTERNS)
        if len(content_lines) >= 3 and not is_skip:
            value_blocks.append({
                "heading": current_heading,
                "lines": current_lines,
                "text": "\n".join(current_lines),
            })

    print(f"  识别到有价值块: {len(value_blocks)} 个")

    if not value_blocks:
        print(f"  ℹ️  未识别到有价值的内容块")
        return

    print(f"\n  待提炼块：")
    for b in value_blocks:
        preview = b["text"].replace("\n", " ")[:80]
        print(f"    [{b['heading'][:40]}] → {preview}...")

    if dry_run:
        print(f"\n  [预览模式] 去掉 --dry-run 执行。")
        return

    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    insert_text = f"## 📅 来自 {date_str} 日志（提炼于 {ts}）\n\n"
    for b in value_blocks:
        insert_text += b["text"].rstrip() + "\n\n"

    if os.path.exists(stm_path):
        with open(stm_path, "r", encoding="utf-8") as f:
            stm_content = f.read()
    else:
        stm_content = f"# 短期记忆（临时缓冲区）\n\n---\n<!-- STM_BOUNDARY: 初始化 {ts} -->\n"

    STM_BOUNDARY = "<!-- STM_BOUNDARY:"

    if STM_BOUNDARY in stm_content:
        boundary_idx = stm_content.index(STM_BOUNDARY)
        line_start = stm_content.rfind("\n", 0, boundary_idx) + 1
        new_stm = (
            stm_content[:line_start]
            + insert_text
            + stm_content[line_start:]
        )
    else:
        new_stm = stm_content.rstrip() + "\n\n" + insert_text

    with open(stm_path, "w", encoding="utf-8") as f:
        f.write(new_stm)

    stm_lines = len(new_stm.splitlines())
    print(f"\n  ✅ 提炼完成!")
    print(f"  已插入 {len(value_blocks)} 个块到 STM 新内容区顶部")
    print(f"  STM当前: {stm_lines} 行")
    print(f"  下一步: 运行 distill --from-stm 将 STM 内容提炼到 MEMORY.md")
    print(f"{'=' * 60}\n")


# ===== 修改19: main() 帮助文本更新 =====

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command in ("--help", "-h", "help"):
        print(__doc__)
        sys.exit(0)

    if command == "log":
        if len(sys.argv) < 4:
            print("用法: evolution_guardian.py log <domain> '<task>' <result> [error_type] [error_cat] [tokens] [duration] [--lesson='教训'] [--trace='工具链'] [--context='决策原因']")
            sys.exit(1)
        # 解析 named 参数
        lesson_arg = ""
        trace_arg = ""
        context_arg = ""
        positional = []
        for a in sys.argv[2:]:
            if a.startswith("--lesson="):
                lesson_arg = a.split("=", 1)[1].strip().strip("'\"")
            elif a.startswith("--trace="):
                trace_arg = a.split("=", 1)[1].strip().strip("'\"")
            elif a.startswith("--context="):
                context_arg = a.split("=", 1)[1].strip().strip("'\"")
            else:
                positional.append(a)
        cmd_log(
            positional[0] if len(positional) > 0 else "",
            positional[1] if len(positional) > 1 else "",
            positional[2] if len(positional) > 2 else "success",
            positional[3] if len(positional) > 3 else "",
            positional[4] if len(positional) > 4 else "",
            positional[5] if len(positional) > 5 else 0,
            positional[6] if len(positional) > 6 else 0,
            lesson=lesson_arg,
            trace=trace_arg,
            context=context_arg,
        )

    elif command == "check":
        if len(sys.argv) < 3:
            print(f"用法: evolution_guardian.py check <domain>")
            sys.exit(1)
        cmd_check(sys.argv[2])

    elif command == "feedback":
        if len(sys.argv) < 7:
            print("用法: evolution_guardian.py feedback <agent> <type> <severity> '<phrase>' '<context>'")
            sys.exit(1)
        cmd_feedback(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6])

    elif command == "review":
        if len(sys.argv) < 3:
            print(f"用法: evolution_guardian.py review <domain> [--auto]")
            sys.exit(1)
        auto_arg = "--auto" in sys.argv[2:]
        cmd_review(sys.argv[2], auto=auto_arg)

    elif command == "evolve":
        if len(sys.argv) < 3:
            print(f"用法: evolution_guardian.py evolve <domain> [reason]")
            sys.exit(1)
        cmd_evolve(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")

    elif command == "status":
        if len(sys.argv) < 3:
            print("用法: evolution_guardian.py status <domain>")
            sys.exit(1)
        cmd_check(sys.argv[2])

    elif command in ("experience-update", "exp-update"):
        if len(sys.argv) < 5:
            print("用法: evolution_guardian.py experience-update <domain> <old_id> <deprecate|supersede> [new_id]")
            sys.exit(1)
        new_id = sys.argv[5] if len(sys.argv) > 5 else None
        cmd_experience_update(sys.argv[2], sys.argv[3], new_id, sys.argv[4])

    elif command == "distill":
        memory_path_arg = None
        dry_run_arg = False
        from_stm_arg = False
        from_daily_arg = False
        date_arg = None
        for arg in sys.argv[2:]:
            if arg == "--dry-run":
                dry_run_arg = True
            elif arg == "--from-stm":
                from_stm_arg = True
            elif arg == "--from-daily":
                from_daily_arg = True
            elif arg.startswith("--date="):
                date_arg = arg.split("=", 1)[1].strip()
            elif not arg.startswith("--"):
                memory_path_arg = arg

        if from_daily_arg:
            root = _find_project_root()
            _cmd_distill_from_daily(root, date_str=date_arg, dry_run=dry_run_arg)
        else:
            cmd_distill(memory_path=memory_path_arg, dry_run=dry_run_arg, from_stm=from_stm_arg)

    elif command in ("archive-logs", "archive_logs"):
        days_arg = 15
        dry_run_arg = False
        for arg in sys.argv[2:]:
            if arg.startswith("--days="):
                raw = arg.split("=", 1)[1]
                try:
                    days_arg = int(raw)
                except ValueError:
                    print(f"❌ --days 必须是整数（当前: '{raw}'）")
                    sys.exit(1)
            elif arg == "--dry-run":
                dry_run_arg = True
            elif arg in ("--help", "-h"):
                print("用法: evolution_guardian.py archive-logs [--days=N] [--dry-run]")
                sys.exit(0)
            else:
                print(f"❌ 未知参数: '{arg}'")
                sys.exit(1)
        cmd_archive_logs(days=days_arg, dry_run=dry_run_arg)

    # ★ v5.1 新增: hot-experiences
    elif command == "hot-experiences":
        count = 5
        if len(sys.argv) >= 3:
            try:
                count = int(sys.argv[2])
            except ValueError:
                pass
        cmd_hot_experiences(count)

    # ★ v5.1 新增: decay
    elif command == "decay":
        dry_run_arg = "--dry-run" in sys.argv[2:]
        cmd_decay(dry_run=dry_run_arg)

    else:
        print(f"未知命令: {command}")
        print("可用命令: log | check | evolve | feedback | review | status | experience-update | distill | archive-logs | hot-experiences | decay")
        print("蒸馏三段式: distill --from-daily → distill --from-stm → distill")
        sys.exit(1)


if __name__ == "__main__":
    # ★ 热启动
    try:
        import importlib.util as _iu, sys
        from pathlib import Path as _HotstartPath
        _hr = str(_HotstartPath(__file__).parent)
        _hs_candidates = [
            Path(_hr) / "hotstart.py",
            Path(_hr) / "scripts" / "hotstart.py",
            Path(_hr).parent.parent / "workspace" / "skill-repo" / "scripts" / "hotstart.py",
        ]
        for _cand in _hs_candidates:
            if _cand.exists():
                _spec = _iu.spec_from_file_location("hotstart_mod", str(_cand))
                _mod = _iu.module_from_spec(_spec)
                _spec.loader.exec_module(_mod)
                _mod.ensure_hotstart("self-evolving-core-hotstart", cache_ttl=300)
                break
    except Exception:
        pass

    main()