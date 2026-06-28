#!/usr/bin/env python3
"""
大一统Agent架构 — 领域路由器 v5.2.0 (Domain Router)
====================================================
v5.2.0 变更：
  - ★ 新增跨语种经验检索：query_keywords 双语扩展，中英文任务都能命中经验
  - ★ load_experiences 增加 insight 字段匹配（权重2，与scenario同级）
  - ★ 内置轻量双语术语映射 + _expand_bilingual_query()

v4.6.2 变更：
  - ★ 修复 classify_input 匹配逻辑：
    - 新增策略B「去虚词后匹配」(0.8分) — 解决"开发一个skill"匹配"开发skill"
    - 新增策略C「分词组合匹配」(0.5分) — 解决"数据分析"匹配"分析用户行为数据"
    - 精确匹配增加长度奖励 — 更长的关键词(=更精准)得分更高
    - 增加 coverage tiebreaker — 分数相同时匹配覆盖率高的域优先
  - ★ 改进 _extract_topic_from_input 触发词提取：
    - boundary_chars 增加"来去到在从向往由"
    - stop_words 增加"写个/搞个/做个"等口语虚词
    - 关键词生成阶段增加 _is_clean_keyword 过滤器

v4.6.1 变更：
  - ★ 动态域创建：预设触发词全部未命中时，从用户任务描述智能提取主题→自动建域
  - 防爆机制：总域≤10 / 单日新建≤2 / 输入<8字不建 / 相似域合并
  - 新域立即可用，无需重新deploy

v4.5.4 变更：
  - 输出末尾自动追加结构化"任务完成后必做"清单（log/distill 现成命令）
  - JSON 新增 next_actions 字段（机器可读）
  - CLI 末尾追加 ⏰ 提示块（人类可读，蠢模型也能看到）

v4.0 变更：内嵌经验检索 + 免疫规则预检 + 自进化协议集成

核心功能：
  接收用户输入 → 匹配领域 → 加载角色快照 + 相关经验 + 免疫规则 → 输出执行上下文 → 强制收尾任务

使用方式：
  python3 domains/_shared/domain_router.py "用户输入的任务描述"

输出：
  JSON格式 + 末尾「⏰ 任务完成后请执行」结构化收尾任务清单
"""

import json
import os
import sys
import re
import hashlib
import time
from pathlib import Path
from datetime import datetime

# === 配置 ===
DOMAINS_ROOT = Path(__file__).parent.parent  # domains/
SHARED_DIR = DOMAINS_ROOT / "_shared"
INDEX_FILE = SHARED_DIR / "index.json"
CONFIG_FILE = SHARED_DIR / "evo-config.json"
TOP_K_EXPERIENCES = 5  # 检索时返回最相关的K条经验


# ============================================================
# 第一层：基础加载函数
# ============================================================

def load_index():
    """加载全局索引"""
    with open(INDEX_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_config():
    """加载全局进化配置"""
    if not CONFIG_FILE.exists():
        return None
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_role_snapshot(domain: str) -> dict:
    """加载指定领域的角色快照"""
    snapshot_file = DOMAINS_ROOT / domain / "role-snapshot.json"
    if not snapshot_file.exists():
        return None
    with open(snapshot_file, 'r', encoding='utf-8') as f:
        return json.load(f)


# ============================================================
# v5.2: 跨语种经验检索支持
# ============================================================

# 轻量双语术语映射（与 evolution_guardian.py 同源，检索侧子集）
_BILINGUAL_MAP = {
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
    "数据库": "database", "索引": "index", "字段": "field", "表": "table",
    "基金": "fund", "股票": "stock", "债券": "bond", "指数": "index",
    "净值": "nav", "持仓": "holding", "分红": "dividend", "估值": "valuation",
    "收益": "return", "风险": "risk", "合规": "compliance", "审计": "audit",
    "报表": "report", "财务": "finance", "资产": "asset",
    "经验": "experience", "规则": "rule", "路由": "route", "蒸馏": "distill",
    "进化": "evolution", "记忆": "memory", "域": "domain", "技能": "skill",
    "提示词": "prompt", "上下文": "context", "模型": "model",
}
_BILINGUAL_MAP_REV = {v: k for k, v in _BILINGUAL_MAP.items()}


def _expand_bilingual_query(keywords: list) -> list:
    """对检索关键词进行双语扩展，使中文任务能命中英文经验、英文任务能命中中文经验"""
    if not keywords:
        return []
    expanded = list(keywords)
    seen = set(kw.lower() for kw in keywords)
    for kw in keywords:
        kw_lower = kw.lower()
        # 中→英
        if kw in _BILINGUAL_MAP:
            en = _BILINGUAL_MAP[kw]
            if en.lower() not in seen:
                expanded.append(en)
                seen.add(en.lower())
        # 英→中
        elif kw_lower in _BILINGUAL_MAP_REV:
            zh = _BILINGUAL_MAP_REV[kw_lower]
            if zh not in seen:
                expanded.append(zh)
                seen.add(zh)
        # 部分匹配
        else:
            for zh, en in _BILINGUAL_MAP.items():
                if zh in kw and en.lower() not in seen:
                    expanded.append(en)
                    seen.add(en.lower())
                    break
                elif kw_lower == en.lower() and zh not in seen:
                    expanded.append(zh)
                    seen.add(zh)
                    break
    return expanded


def load_experiences(domain: str, query_keywords: list = None, top_k: int = TOP_K_EXPERIENCES) -> list:
    """
    加载指定领域的经验数据（v5.2增强版）
    支持三种模式：
      1. domain="data" → 加载 domains/data/experiences.json
      2. domain="_shared" → 加载 domains/_shared/admin-experiences.json
    如果提供query_keywords，按相关性排序返回top_k
    
    ★ v5.2: 新增跨语种检索 + insight字段匹配
    """
    # _shared 域用 admin-experiences 文件
    if domain == "_shared":
        exp_file = SHARED_DIR / "admin-experiences.json"
    else:
        exp_file = DOMAINS_ROOT / domain / "experiences.json"

    if not exp_file.exists():
        return []

    with open(exp_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 兼容两种格式: list 或 dict{experiences: [...]}
    if isinstance(data, list):
        all_experiences = data
    else:
        all_experiences = data.get('experiences', [])

    # ★ v4.2: 只检索 active 状态的经验（deprecated/superseded 的不参与检索）
    # 兼容旧数据：没有 status 字段的视为 active
    experiences = [
        e for e in all_experiences
        if e.get('status', 'active') == 'active'
    ]

    # 如果没有关键词查询，返回全部 active（按confidence降序）
    if not query_keywords:
        experiences.sort(key=lambda x: x.get('confidence', 0), reverse=True)
        return experiences[:top_k]

    # ★ v5.2: 对query_keywords进行双语扩展，使中英文任务都能命中经验
    expanded_query = _expand_bilingual_query(query_keywords)

    # 关键词匹配评分（BM25简化版）
    MIN_RELEVANCE_SCORE = 1.5  # ★ v4.2: 相关性阈值，低于此分数的不返回给AI
    scored = []
    for exp in experiences:
        exp_keywords = exp.get('keywords', [])
        scenario = exp.get('scenario', '')
        insight = exp.get('insight', '')  # ★ v5.2: 新增insight匹配
        fact = exp.get('fact', '')
        confidence_raw = exp.get('confidence', 0)
        # 兼容非数值类型: 'N/A', 'high', 'medium', 'low' 等
        if isinstance(confidence_raw, (int, float)):
            confidence = float(confidence_raw)
        elif isinstance(confidence_raw, str):
            conf_map = {'high': 0.9, 'medium': 0.6, 'low': 0.3}
            confidence = conf_map.get(confidence_raw.lower(), 0.5)
        else:
            confidence = 0.5
        score = 0

        for qk in expanded_query:
            qk_lower = qk.lower()
            # 关键词精确匹配(权重高=3)
            for ek in exp_keywords:
                if qk_lower in ek.lower():
                    score += 3
            # 场景文本部分匹配(权重中=2)
            if qk_lower in scenario.lower():
                score += 2
            # ★ v5.2: insight字段匹配(权重中=2，与scenario同级)
            if insight and qk_lower in insight.lower():
                score += 2
            # 事实/步骤文本匹配(权重低=1)
            fact_text = fact or json.dumps(exp.get('steps', []), ensure_ascii=False)
            if qk_lower in fact_text.lower():
                score += 1

        # 置信度加权
        score = score * (0.5 + confidence * 0.5)
        scored.append((score, exp))

    # 按分数降序排列，取top_k，且过滤掉相关性不足的（宁可返回0条也不返回不相关的）
    scored.sort(key=lambda x: x[0], reverse=True)
    return [exp for score, exp in scored[:top_k] if score >= MIN_RELEVANCE_SCORE]


def load_immune_rules(domain: str) -> list:
    """
    加载指定领域的免疫规则（v4.0新增）
    返回该domain下所有免疫规则列表
    """
    rules_file = DOMAINS_ROOT / domain / "immune_rules.json"
    if not rules_file.exists():
        return []

    with open(rules_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    return data.get('rules', [])


# ============================================================
# 第二层：分类与检索
# ============================================================

def classify_input(user_input: str, index: dict) -> tuple:
    """
    分类用户输入到最匹配的领域
    返回 (domain_name, match_score, matched_keywords)

    匹配策略（三层）：
      A: 精确子串匹配（满分 1.0）
      B: 去虚词后子串匹配（0.8分）—— 解决"开发一个skill"匹配"开发skill"
      C: 分词组合匹配（0.5分）—— 解决"数据分析"匹配"分析用户行为数据"
    """
    input_lower = user_input.lower()

    # 去虚词版本（用于策略B）
    filler_words = [
        "帮我", "请", "我要", "需要", "一下", "一个", "这个", "那个",
        "一套", "一批", "一组", "一种", "一份", "某个", "某种",
        "进行", "来", "去", "把", "做", "搞", "弄",
    ]
    input_no_filler = input_lower
    for fw in filler_words:
        input_no_filler = input_no_filler.replace(fw, "")
    input_no_filler = input_no_filler.strip()

    results = []

    for domain_name, domain_info in index.get("domains", {}).items():
        trigger_keywords = domain_info.get("trigger_keywords", [])
        anti_keywords = domain_info.get("anti_trigger_keywords", [])

        # 反触发词检查（命中则大幅降分）
        anti_score = 0
        for ak in anti_keywords:
            if ak.lower() in input_lower:
                anti_score -= 2

        # 正向关键词匹配（三层策略）
        pos_score = 0
        matched = []
        for tk in trigger_keywords:
            tk_lower = tk.lower()
            # 策略A: 精确子串匹配
            # 分数 = 1.0 + 长度奖励（更长的关键词匹配更精准）
            if tk_lower in input_lower:
                length_bonus = min(len(tk) * 0.1, 0.5)  # 每字+0.1，上限0.5
                pos_score += 1.0 + length_bonus
                matched.append(tk)
            # 策略B: 去虚词后子串匹配（0.8分）
            elif tk_lower in input_no_filler:
                pos_score += 0.8
                matched.append(tk + "(去虚词)")
            # 策略C: 分词组合匹配（半分0.5）
            # 对≥3字中文关键词，首尾2字段都出现在输入中则算命中
            elif len(tk) >= 3 and all('\u4e00' <= c <= '\u9fff' for c in tk):
                bigrams = [tk[i:i+2] for i in range(len(tk) - 1)]
                first_last = [bigrams[0], bigrams[-1]]
                if all(bg in input_lower for bg in first_last):
                    pos_score += 0.5
                    matched.append(tk + "(模糊)")

        total_score = pos_score + anti_score
        # 计算覆盖率作为 tiebreaker（匹配词总字数 / 输入字数）
        matched_chars = sum(len(m.split("(")[0]) for m in matched)
        coverage = matched_chars / max(len(user_input), 1)
        results.append((domain_name, total_score, matched, coverage))

    # 排序：先按分数降序，分数相同时按覆盖率降序
    results.sort(key=lambda x: (x[1], x[3]), reverse=True)
    best_domain, best_score, best_matched, _ = results[0]

    # 阈值：至少匹配1个关键词才算命中
    if best_score <= 0:
        # ★ v5.1 修改22: 域目录名兜底匹配
        # 所有正式触发词miss时，扫描domains目录，域名出现在输入中则作为低置信度匹配
        root = str(DOMAINS_ROOT)
        if os.path.isdir(root):
            for d in os.listdir(root):
                if d.startswith("_") or d.startswith("."):
                    continue
                if not os.path.isdir(os.path.join(root, d)):
                    continue
                # 域名出现在输入中 → 低置信度匹配（0.3分）
                if d.lower() in input_lower:
                    return d, 0.3, [f"{d}(目录名兜底)"]
        return None, 0, []

    return best_domain, best_score, best_matched


def dynamic_create_domain(user_input: str, index: dict) -> dict:
    """
    ★ v4.6.1新增: 运行时动态域创建。

    当所有预设域的触发词都未命中时，从用户任务描述中智能提取主题，
    创建一个新的业务域（含目录结构+index注册），使后续相同主题的任务
    可以精准路由并积累经验。

    防爆机制：
      - 总域数上限: 10（超过则不再新建，归入_shared）
      - 单日新建上限: 2（避免碎片化）
      - 输入太短(<8字): 不建域（信息量不足）

    返回:
      成功: {"domain": "域key", "keywords": [...], "created": True/False}
      失败(防爆触发): None
    """
    # 防爆检查1: 总域数上限
    current_domains = index.get("domains", {})
    if len(current_domains) >= 10:
        return None

    # 防爆检查2: 输入太短，信息量不足以建域
    if len(user_input.strip()) < 8:
        return None

    # 防爆检查3: 单日新建上限（检查今天已动态创建了几个域）
    today_str = datetime.now().strftime("%Y-%m-%d")
    dynamic_today_count = 0
    for d_info in current_domains.values():
        if d_info.get("source") == "dynamic_inferred":
            created_date = d_info.get("created_date", "")
            if created_date == today_str:
                dynamic_today_count += 1
    if dynamic_today_count >= 2:
        return None

    # 从用户输入中提取核心主题
    topic_info = _extract_topic_from_input(user_input)
    if not topic_info:
        return None

    domain_key = topic_info["key"]
    domain_name = topic_info["name"]
    trigger_keywords = topic_info["keywords"]
    description = topic_info["description"]

    # 检查是否与已有域高度相似（避免创建近义域）
    for existing_key, existing_info in current_domains.items():
        existing_kws = set(kw.lower() for kw in existing_info.get("trigger_keywords", []))
        new_kws = set(kw.lower() for kw in trigger_keywords)
        if existing_kws and new_kws:
            overlap = len(existing_kws & new_kws) / max(len(new_kws), 1)
            if overlap >= 0.4:
                # 与已有域相似度高，不建新域，但把新关键词追加到已有域
                _append_keywords_to_existing_domain(existing_key, trigger_keywords)
                return {"domain": existing_key, "keywords": trigger_keywords, "created": False}

    # 创建新域！
    _create_domain_runtime(domain_key, domain_name, description, trigger_keywords, today_str)

    return {"domain": domain_key, "keywords": trigger_keywords, "created": True}


def _extract_topic_from_input(user_input: str) -> dict:
    """
    从用户任务描述中提取核心主题，生成域配置。

    提取策略（多层）：
      L1: 识别"动词+名词"任务结构 → 名词部分作为域主题
      L2: 提取连续中文名词短语(2~4字) → 按信息量排序取最佳
      L3: 提取英文技术术语 → 可能是技术栈/工具名
      Fallback: 取输入前4个非停用字组合

    返回: {"key": str, "name": str, "keywords": [...], "description": str} 或 None
    """
    input_text = user_input.strip()

    # 停用词/虚词/指示词（用于切分和过滤）
    stop_words = {
        "帮我", "请", "我要", "需要", "可以", "怎么", "如何", "什么",
        "一下", "一个", "这个", "那个", "进行", "执行", "完成", "开始",
        "使用", "应该", "不能", "不要", "然后", "接下来", "已经", "可能",
        "这只", "那只", "哪个", "所有", "每个", "某个", "一些",
        "一套", "一批", "一组", "这些", "那些", "几个", "多个",
        "写个", "搞个", "做个", "弄个", "来个", "整个",
    }
    # 量词/指示词前缀（用于清理名词短语的开头）
    prefix_noise = ["一个", "一套", "一批", "一组", "一种", "一份",
                    "这个", "那个", "这只", "那只", "这些", "那些",
                    "某个", "某种", "每个", "所有", "多个", "几个"]
    # 中文虚词/助词/连接词（用于分割名词短语边界）
    boundary_chars = set("的了吗呢吧呀啊哦嗯么着过得把被给让跟和与及或来去到在从向往由")

    # 常见任务动词
    task_verbs = [
        "配置", "搭建", "迁移", "优化", "监控", "管理", "集成", "对接",
        "排查", "修复", "调试", "编排", "编译", "打包", "上传", "下载",
        "翻译", "校对", "审核", "评审", "归档", "备份", "恢复", "同步",
        "训练", "微调", "推理", "标注", "清洗", "建模", "预测", "分类",
        "爬取", "抓取", "解析", "转换", "映射", "提取", "生成", "渲染",
        "运营", "推广", "投放", "复盘", "汇报", "对账", "结算", "核算",
        "部署", "发布", "开发", "设计", "分析", "测试", "编写", "创建",
        "实现", "重构", "整理", "总结", "规划", "梳理", "制作", "构建",
    ]
    task_verbs_set = set(task_verbs)

    # 预处理：用虚词/助词作为边界切分输入
    # 把 boundary_chars 替换为空格，得到名词短语候选段
    cleaned = input_text
    for bc in boundary_chars:
        cleaned = cleaned.replace(bc, " ")
    # 把停用词也替换为空格
    for sw in stop_words:
        cleaned = cleaned.replace(sw, " ")
    # 把动词也替换为空格（这样剩下的都是名词性成分）
    for verb in task_verbs:
        cleaned = cleaned.replace(verb, " ")

    # L1: "动词+名词"结构提取（在原始文本中找）
    found_verb = None
    found_noun = None
    for verb in task_verbs:
        idx = input_text.find(verb)
        if idx >= 0:
            after_verb = input_text[idx + len(verb):]
            # 跳过虚词前缀和量词
            after_verb = after_verb.lstrip("".join(boundary_chars))
            for pn in prefix_noise:
                if after_verb.startswith(pn):
                    after_verb = after_verb[len(pn):]
                    break
            after_verb = after_verb.lstrip("".join(boundary_chars))
            # 提取连续中文字符（遇到虚词/标点/空格停止）
            noun_chars = []
            for ch in after_verb:
                if ch in boundary_chars or not ('\u4e00' <= ch <= '\u9fff'):
                    break
                noun_chars.append(ch)
            noun = "".join(noun_chars)
            # 过滤：2~4字，非停用词，非动词
            if 2 <= len(noun) <= 4 and noun not in stop_words and noun not in task_verbs_set:
                found_verb = verb
                found_noun = noun
                break
            # 如果>4字，截取前4字
            elif len(noun) > 4:
                noun = noun[:4]
                if noun not in stop_words and noun not in task_verbs_set:
                    found_verb = verb
                    found_noun = noun
                    break

    # L2: 从切分后的段中提取名词短语候选
    segments = [s.strip() for s in cleaned.split() if len(s.strip()) >= 2]
    # 对每个段提取2~4字中文短语
    cn_nouns = []
    for seg in segments:
        # 清理量词前缀
        for pn in prefix_noise:
            if seg.startswith(pn):
                seg = seg[len(pn):]
                break
        # 提取连续中文字符
        cn_chunks = re.findall(r'[\u4e00-\u9fff]{2,4}', seg)
        for chunk in cn_chunks:
            if chunk not in stop_words and chunk not in task_verbs_set:
                # 再次检查是否以量词开头
                is_noise = False
                for pn in prefix_noise:
                    if chunk.startswith(pn[:2]):
                        is_noise = True
                        break
                if not is_noise:
                    cn_nouns.append(chunk)

    # L3: 英文技术术语（优先大写开头或全小写技术词）
    en_terms = re.findall(r'[a-zA-Z][a-zA-Z0-9_\-\.]{2,20}', input_text)
    # 过滤英文停用词和编程关键字
    en_stop = {
        "the", "and", "for", "with", "from", "this", "that", "not", "are", "was",
        "how", "what", "why", "can", "will", "should", "would", "could", "may",
        "implement", "create", "make", "build", "write", "add", "use", "get",
        "set", "put", "run", "help", "server", "client", "real", "time",
    }
    en_terms = [t for t in en_terms if t.lower() not in en_stop and len(t) >= 3]

    # 决策：选择最佳主题
    if found_noun and len(found_noun) >= 2:
        primary_topic = found_noun
        topic_verb = found_verb
    elif cn_nouns:
        # 取最具信息量的（优先3~4字）
        cn_nouns_sorted = sorted(cn_nouns, key=lambda x: (min(len(x), 4), cn_nouns.index(x) == 0), reverse=True)
        primary_topic = cn_nouns_sorted[0]
        topic_verb = ""
    elif en_terms:
        primary_topic = en_terms[0]
        topic_verb = ""
    else:
        return None

    # 生成域key
    if re.match(r'^[a-zA-Z]', primary_topic):
        domain_key = re.sub(r'[^a-z0-9_]', '_', primary_topic.lower())[:16]
    else:
        # 中文主题：优先用同句中的英文术语做key
        if en_terms:
            domain_key = re.sub(r'[^a-z0-9_]', '_', en_terms[0].lower())[:16]
        else:
            # 用中文字的unicode末两位拼接（简短但唯一）
            domain_key = f"topic_{''.join(format(ord(c), 'x')[-2:] for c in primary_topic[:3])}"

    # 确保key合法
    domain_key = re.sub(r'[^a-z0-9_]', '', domain_key)
    if not domain_key or domain_key[0].isdigit():
        domain_key = "d_" + domain_key
    if len(domain_key) < 2:
        domain_key = "dynamic_topic"

    # 构建触发词列表（名词优先，不含动词/虚词）
    # 最终过滤：移除含虚词字符的碎片
    noise_chars = boundary_chars | set("个")
    def _is_clean_keyword(kw):
        """过滤掉含虚词字符、动词碎片、停用词的伪关键词"""
        if kw in stop_words or kw in task_verbs_set:
            return False
        # 中文关键词不应包含虚词字符
        if all('\u4e00' <= c <= '\u9fff' for c in kw):
            if any(c in noise_chars for c in kw):
                return False
        return True

    keywords = []
    if found_noun and _is_clean_keyword(found_noun):
        keywords.append(found_noun)
    for noun in cn_nouns:
        if noun not in keywords and noun != found_noun and _is_clean_keyword(noun):
            keywords.append(noun)
            if len(keywords) >= 4:
                break
    for term in en_terms[:2]:
        if term not in keywords:
            keywords.append(term)

    if len(keywords) < 2:
        return None

    # 生成描述
    if topic_verb:
        description = f"{topic_verb}{primary_topic}/相关任务处理与经验积累"
    else:
        description = f"{primary_topic}相关任务处理与经验积累"

    # 生成域名
    domain_name = f"{primary_topic}领域"

    return {
        "key": domain_key,
        "name": domain_name,
        "keywords": keywords[:6],
        "description": description,
    }


def _atomic_write_json(path, data):
    """★ v4.6.8: 原子写 JSON — tmp + fsync + os.replace。
    避免 index.json 在写入中断时损坏（损坏后整个路由系统瘫痪）。
    """
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


def _append_keywords_to_existing_domain(domain_key: str, new_keywords: list):
    """将新触发词追加到已有域的 index.json 配置中"""
    try:
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            index_data = json.load(f)

        domain_info = index_data.get("domains", {}).get(domain_key)
        if domain_info:
            existing_kws = set(domain_info.get("trigger_keywords", []))
            for kw in new_keywords:
                if kw not in existing_kws:
                    existing_kws.add(kw)
            domain_info["trigger_keywords"] = list(existing_kws)[:15]  # 上限15个
            index_data["last_updated"] = datetime.now().isoformat()

            # ★ v4.6.8: 改用原子写
            _atomic_write_json(INDEX_FILE, index_data)
    except Exception:
        pass  # 非关键路径，静默失败


def _create_domain_runtime(domain_key: str, domain_name: str, description: str,
                           trigger_keywords: list, today_str: str):
    """
    运行时创建新域：目录结构 + index.json 注册。

    创建内容：
      - domains/{key}/
      - domains/{key}/experiences.json (空)
      - domains/{key}/immune_rules.json (空)
      - domains/{key}/role-snapshot.json (基本信息)
      - 更新 domains/_shared/index.json
    """
    domain_dir = DOMAINS_ROOT / domain_key

    try:
        # 创建目录
        domain_dir.mkdir(parents=True, exist_ok=True)

        # experiences.json
        exp_file = domain_dir / "experiences.json"
        if not exp_file.exists():
            _atomic_write_json(exp_file, {
                "schema_version": "4.0",
                "domain": domain_key,
                "description": description,
                "experiences": [],
                "created_by": "dynamic_domain_router_v4.6.1",
                "created_date": today_str,
            })

        # immune_rules.json
        rules_file = domain_dir / "immune_rules.json"
        if not rules_file.exists():
            _atomic_write_json(rules_file, {
                "schema_version": "4.0",
                "domain": domain_key,
                "rules": [],
            })

        # role-snapshot.json
        snapshot_file = domain_dir / "role-snapshot.json"
        if not snapshot_file.exists():
            _atomic_write_json(snapshot_file, {
                "role_name": domain_name,
                "core_identity": description,
                "responsibilities": [description],
                "forbidden_actions": [],
                "key_methods": {},
                "work_principles": ["精准路由", "经验积累", "持续优化"],
                "source": "dynamic_inferred",
                "created_date": today_str,
            })

        # 更新 index.json
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            index_data = json.load(f)

        index_data["domains"][domain_key] = {
            "name": domain_name,
            "path": f"domains/{domain_key}/",
            "role_name": domain_name,
            "trigger_keywords": trigger_keywords,
            "experience_count": 0,
            "source": "dynamic_inferred",
            "created_date": today_str,
        }
        index_data["total_domains"] = len(index_data["domains"])
        index_data["last_updated"] = datetime.now().isoformat()

        # ★ v4.6.8: index.json 是路由命脉，必须原子写
        _atomic_write_json(INDEX_FILE, index_data)

        # 输出创建提示
        print(f"\n  🆕 动态创建新域: [{domain_key}] 《{domain_name}》")
        print(f"     触发词: {trigger_keywords}")
        print(f"     描述: {description}")
        print(f"     路径: domains/{domain_key}/")

    except Exception as e:
        print(f"\n  ⚠️ 动态建域失败({domain_key}): {e}", file=sys.stderr)


def check_immune_rules(user_input: str, domain: str) -> list:
    """
    检查用户输入是否触发免疫规则（v4.0新增 — 内嵌pre_task_check核心逻辑）

    对比用户输入与当前域的免疫规则触发模式，
    返回所有被触发的规则列表（按severity排序）。
    这是轻量级预检，不需要调用外部脚本。
    """
    if not domain:
        return []

    rules = load_immune_rules(domain)
    if not rules:
        return []

    input_lower = user_input.lower()
    triggered = []

    for rule in rules:
        patterns = rule.get('trigger_pattern', [])
        triggered_count = 0
        for pattern in patterns:
            if pattern.lower() in input_lower:
                triggered_count += 1

        # 至少命中1个触发词才算触发
        if triggered_count > 0:
            triggered.append({
                "id": rule.get('id'),
                "scenario": rule.get('scenario'),
                "rule": rule.get('rule'),
                "severity": rule.get('severity', 'info'),
                "source_lesson": rule.get('source_lesson', ''),
                "triggered_patterns": triggered_count,
                "effective_since": rule.get('effective_since', '')
            })

    # 按严重程度排序: critical > warning > info
    severity_order = {'critical': 0, 'warning': 1, 'info': 2}
    triggered.sort(key=lambda r: severity_order.get(r['severity'], 9))

    return triggered


# ============================================================
# 第三层：路由主函数
# ============================================================

def route(user_input: str, verbose: bool = True) -> dict:
    """
    主路由函数 v4.0：用户任务 → 完整执行上下文

    新增输出字段：
      immune_rules_triggered: 触发的免疫规则列表（内嵌预检结果）
      pre_task_warnings: 预检警告信息
      evolution_protocol: 自进化协议提示
    """
    index = load_index()
    config = load_config()

    # Step 1: 分类
    domain, score, matched = classify_input(user_input, index)

    # Step 1.5: ★ v4.6.1 动态域创建 — 预设触发词全部未命中时，智能分析任务创建新域
    if domain is None:
        dynamic_result = dynamic_create_domain(user_input, index)
        if dynamic_result:
            domain = dynamic_result["domain"]
            score = 1
            matched = dynamic_result["keywords"]
            # 重新加载 index（已被 dynamic_create_domain 更新）
            index = load_index()

    # Step 2: 加载角色快照
    snapshot = None
    if domain:
        snapshot = load_role_snapshot(domain)

    # Step 3: 加载相关经验（域专属 + 跨域共享）
    # ★ v5.2: 清洗matched keywords + 从用户输入中提取补充语义关键词
    import re as _re
    clean_keywords = None
    if matched:
        # 去除括号注释，提取纯净关键词
        raw_clean = [kw.split("(")[0].strip() for kw in matched if kw.split("(")[0].strip()]
        # 拆分中英混合词（如"创建skill"→["创建","skill"]）
        clean_keywords = []
        for kw in raw_clean:
            parts_cn = _re.findall(r'[\u4e00-\u9fff]+', kw)
            parts_en = _re.findall(r'[a-zA-Z_-]{2,}', kw)
            if parts_cn and parts_en:
                # 中英混合词：拆分为独立的中文和英文部分
                clean_keywords.extend(parts_cn)
                clean_keywords.extend([p.lower() for p in parts_en])
            else:
                clean_keywords.append(kw)
    # ★ v5.2: 始终从user_input中补充语义关键词（确保检索质量）
    en_words = [w.lower() for w in _re.findall(r'[a-zA-Z]{3,}', user_input)]
    cn_segs = [s for s in _re.split(r'[^\u4e00-\u9fff]+', user_input) if len(s) >= 2]
    supplementary = (en_words + cn_segs)[:6]
    if clean_keywords:
        for s in supplementary:
            if s.lower() not in [k.lower() for k in clean_keywords]:
                clean_keywords.append(s)
    else:
        clean_keywords = supplementary if supplementary else None

    experiences = []
    admin_experiences = []
    if domain:
        experiences = load_experiences(domain, clean_keywords)
    # 始终加载admin通用经验（跨域共享，top_3控制量）— 使用清洗后的keywords
    admin_experiences = load_experiences("_shared", clean_keywords, top_k=3)

    # Step 4: 免疫规则预检（v4.0新增 — 内嵌pre_task_check核心逻辑）
    triggered_rules = check_immune_rules(user_input, domain)

    # Step 5: 组装完整结果
    result = {
        "timestamp": datetime.now().isoformat(),
        "input": user_input,
        "routing": {
            "matched_domain": domain,
            "match_score": score,
            "matched_keywords": matched,
            "confidence": "high" if score >= 3 else "medium" if score >= 0.5 else "low"
        },
        "role": {
            "name": snapshot.get("role_name", "大总管(默认)") if snapshot else "大总管(默认)",
            "identity": snapshot.get("core_identity", "") if snapshot else "",
            "responsibilities": snapshot.get("responsibilities", []) if snapshot else [],
            "forbidden_actions": snapshot.get("forbidden_actions", []) if snapshot else [],
            "key_methods": snapshot.get("key_methods", {}) if snapshot else {},
            "work_principles": snapshot.get("work_principles", []) if snapshot else []
        } if snapshot else None,
        "experiences": {
            "domain_specific": [
                {
                    "id": e.get("id"),
                    "scenario": e.get("scenario"),
                    "layer": e.get("layer"),
                    # ★ v5.0: 不截断hint，保留完整经验信息
                    "hint": (e.get("fact") or json.dumps(e.get("steps", []), ensure_ascii=False)),
                    "confidence": e.get("confidence")
                }
                for e in experiences
            ],
            "cross_domain_shared": [
                {
                    "id": e.get("id"),
                    "scenario": e.get("scenario"),
                    # ★ v5.0: 不截断hint，保留完整经验信息
                    "hint": (e.get("fact") or json.dumps(e.get("steps", []), ensure_ascii=False))
                }
                for e in admin_experiences
            ]
        },
        # ====== v4.0 新增字段 ======
        "immune_rules_triggered": [
            {
                "id": r["id"],
                "scenario": r["scenario"],
                "rule": r["rule"],
                "severity": r["severity"],
                "source": r.get("source_lesson", "")
            }
            for r in triggered_rules
        ] if triggered_rules else [],
        "pre_task_warnings": generate_preTaskWarnings(triggered_rules),
        "evolution_protocol": generate_evolutionProtocol(domain, config),
        # ===========================
        "execution_advice": generate_executionAdvice(domain, snapshot, experiences, triggered_rules),
        "next_actions": generate_next_actions(user_input, domain, triggered_rules),
        "file_references": {
            "role_snapshot": f"domains/{domain}/role-snapshot.json" if domain else None,
            "experiences": f"domains/{domain}/experiences.json" if domain else None,
            "immune_rules": f"domains/{domain}/immune_rules.json" if domain else None,
            "memory": f"domains/{domain}/memory.json" if domain else None,
            "templates": [f"domains/{domain}/templates/"] if domain and (DOMAINS_ROOT / domain / "templates").exists() else [],
            "rules": [f"domains/{domain}/rules/"] if domain and (DOMAINS_ROOT / domain / "rules").exists() else []
        }
    }

    return result


# ============================================================
# 第四层：辅助生成函数
# ============================================================

def generate_executionAdvice(domain, snapshot, experiences, triggered_rules=None) -> str:
    """生成执行建议（v4.0增强：加入免疫规则警告）"""
    advice_parts = []

    if domain and snapshot:
        role_name = snapshot.get("role_name", "")
        advice_parts.append(f"以「{role_name}」身份执行此任务")

        principles = snapshot.get("work_principles", [])
        if principles:
            advice_parts.append(f"遵循原则: {' | '.join(principles[:3])}")

        forbidden = snapshot.get("forbidden_actions", [])
        if forbidden:
            advice_parts.append(f"禁止操作: {', '.join(forbidden[:3])}")

    # v4.0新增：免疫规则警告优先显示
    if triggered_rules:
        critical_rules = [r for r in triggered_rules if r.get('severity') == 'critical']
        if critical_rules:
            rule_texts = [f"[P0] {r['scenario']}: {r['rule']}" for r in critical_rules]
            advice_parts.append(f"⚠️ 免疫规则警告:\n  " + "\n  ".join(rule_texts))

    if experiences:
        relevant_scenarios = [e.get("scenario", "") for e in experiences[:3]]
        if relevant_scenarios:
            advice_parts.append(f"可参考经验: {', '.join(relevant_scenarios)}")

    if not advice_parts:
        advice_parts.append("使用默认身份(大总管)直接执行")

    return "\n".join(advice_parts)


def generate_preTaskWarnings(triggered_rules: list) -> list:
    """根据触发生成预检警告列表"""
    if not triggered_rules:
        return []

    warnings = []
    for r in triggered_rules:
        severity_icon = {"critical": "🔴", "warning": "🟡", "info": "🔵"}
        icon = severity_icon.get(r.get('severity', 'info'), '⚪')
        warnings.append(
            f"{icon} [{r.get('severity').upper()}] {r['scenario']}: {r['rule']}"
        )
        if r.get('source_lesson'):
            warnings.append(f"   └─ 教训来源: {r['source_lesson']}")

    return warnings


def generate_next_actions(user_input: str, domain: str, triggered_rules: list = None) -> dict:
    """
    ★ v4.5.4 新增：生成结构化「任务完成后必做」清单。

    AI 看到 Router 输出的同时，就同步看到现成的 log 命令（已填好域名+任务摘要），
    复制即用，杜绝"忘记 log"。
    """
    # 任务摘要：取前40字（防止命令过长）
    task_brief = (user_input or "").strip().replace('"', "'").replace("\n", " ")
    if len(task_brief) > 40:
        task_brief = task_brief[:40] + "..."

    inferred_domain = domain or "_shared"
    has_critical = any(r.get('severity') == 'critical' for r in (triggered_rules or []))

    actions = {
        "phase": "post_task_mandatory",
        "headline": "⏰ 任务完成后必做（不可跳过）",
        "primary_command": (
            f'python3 ./domains/_shared/evolution_guardian.py log {inferred_domain} '
            f'"{task_brief}" success'
        ),
        "primary_command_failed_template": (
            f'python3 ./domains/_shared/evolution_guardian.py log {inferred_domain} '
            f'"{task_brief}" failed <error_type> <error_category>'
        ),
        "with_lesson_template": (
            f'python3 ./domains/_shared/evolution_guardian.py log {inferred_domain} '
            f'"{task_brief}" success --lesson "<新经验/教训一句话>"'
        ),
        "checks": [
            "1️⃣ 任务成功 → 复制 primary_command 直接执行",
            "2️⃣ 任务失败 → 用 primary_command_failed_template 填 error_type/category",
            "3️⃣ 学到新经验 → 用 with_lesson_template 一步写经验+免疫规则",
        ],
        "remember": (
            "log 命令内置 R1-R4 阈值自检，每次记账后自动检测进化触发条件。"
            "不 log = 系统失明、记忆爆炸、重复犯错。"
        ),
    }

    if has_critical:
        actions["extra_warning"] = (
            "🔴 已触发 critical 免疫规则，强烈建议任务完成后立刻 log + --lesson 巩固经验"
        )

    return actions


def generate_evolutionProtocol(domain: str, config: dict = None) -> dict:
    """生成本次任务应遵循的自进化协议提示"""
    protocol = {
        "enabled": True if config and config.get("self_evolution_enabled") else False,
        "version": "4.0",
        "actions_required": []
    }

    if not protocol["enabled"]:
        return protocol

    # 任务开始前（Pre-task）
    protocol["actions_required"].append({
        "phase": "pre_task",
        "action": "router_auto_retrieve",
        "description": "✅ 已完成：Router自动检索了相关经验和免疫规则",
        "status": "auto_completed"
    })

    # 任务完成后（Post-task）
    protocol["actions_required"].append({
        "phase": "post_task",
        "action": "log_task_result",
        "description": "记录任务结果到 memory.json（统计+历史）",
        "target_file": f"domains/{domain}/memory.json" if domain else None
    })
    protocol["actions_required"].append({
        "phase": "post_task",
        "action": "extract_experience",
        "description": "如有新经验，追加到 experiences.json",
        "target_file": f"domains/{domain}/experiences.json" if domain else None
    })
    protocol["actions_required"].append({
        "phase": "on_negative_feedback",
        "action": "record_feedback",
        "description": "如收到负面反馈，记录到 evo-feedback.json",
        "target_file": "domains/_shared/evo-feedback.json"
    })

    return protocol


# ============================================================
# CLI入口
# ============================================================

if __name__ == "__main__":
    # ============================================================
    # ★ 热启动：COS版本自动校验（仅self-evolving-core-hotstart自身）
    # hotstart.py 是这个skill的内部文件，跟随skill发布到COS。
    # 不需要热启动的skill不受任何影响。
    # ============================================================
    try:
        import importlib.util as _iu
        _hr = str(Path(__file__).parent)
        # 按优先级搜索hotstart.py（只在这个skill的文件树里找）
        _hs_candidates = [
            Path(_hr) / "hotstart.py",                        # 同目录
            Path(_hr) / "scripts" / "hotstart.py",            # scripts/子目录
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
    # ============================================================

    # ★ v4.6.7: 显式处理 --help / 空字符串，避免被当成查询输入
    HELP_FLAGS = {"--help", "-h", "help", "--h", "/?"}
    if len(sys.argv) < 2 or sys.argv[1] in HELP_FLAGS or not sys.argv[1].strip():
        print("Domain Router v4.5.4 — 大一统自进化架构")
        print("=" * 50)
        print("Usage: python3 domain_router.py \"任务描述\"")
        print("\n示例:")
        print('  python3 domain_router.py "帮我看一下PRD v2.1需要改什么地方"')
        print('  python3 domain_router.py "查一下最近的销售数据情况"')
        print('  python3 domain_router.py "批量处理Excel数据并生成汇总报表"')
        print("\nv4.5.4 新功能:")
        print("  - 末尾自动追加「⏰ 任务完成后必做」结构化收尾任务")
        print("  - JSON 新增 next_actions 字段（机器可读 + 人类可读）")
        print("\nv4.0 功能:")
        print("  - 内嵌经验检索（自动匹配相关经验）")
        print("  - 免疫规则预检（自动触发避坑警告）")
        print("  - 自进化协议提示（任务前后自动提醒）")
        sys.exit(0 if len(sys.argv) >= 2 and sys.argv[1] in HELP_FLAGS else 1)

    user_input = sys.argv[1]
    result = route(user_input)

    # ★ v5.1.1: 签到令牌 — 写入 domains/_shared/（IDE无关，不依赖任何 .workbuddy 路径）
    _token_raw = f"{user_input}|{time.time()}|{os.getpid()}"
    _token = hashlib.sha256(_token_raw.encode()).hexdigest()[:16]
    _token_dir = Path(__file__).parent  # 脚本所在目录（运行时=domains/_shared/）
    if not _token_dir.is_dir():
        _token_dir.mkdir(parents=True, exist_ok=True)
    with open(_token_dir / ".active_task_token", "w", encoding="utf-8") as _tf:
        json.dump({"token": _token, "task": user_input, "time": time.strftime("%Y-%m-%dT%H:%M:%S")}, _tf, ensure_ascii=False)

    # 输出JSON结果
    print(json.dumps(result, ensure_ascii=False, indent=2))

    # ★ v4.5.4: 末尾追加结构化「任务完成后必做」提示块（人类/AI 可读）
    next_actions = result.get("next_actions") or {}
    if next_actions:
        print()
        print("=" * 70)
        print(next_actions.get("headline", "⏰ 任务完成后必做"))
        print("=" * 70)
        print()
        print("✅ 任务成功 → 直接复制执行：")
        print(f"   {next_actions.get('primary_command', '')}")
        print()
        print("❌ 任务失败 → 用此模板（替换 <error_type>/<error_category>）：")
        print(f"   {next_actions.get('primary_command_failed_template', '')}")
        print()
        print("🧠 学到新经验 → 一步写经验+免疫规则：")
        print(f"   {next_actions.get('with_lesson_template', '')}")
        print()
        for chk in next_actions.get("checks", []):
            print(f"   {chk}")
        if next_actions.get("extra_warning"):
            print()
            print(f"   {next_actions['extra_warning']}")
        print()
        print(f"💡 {next_actions.get('remember', '')}")
        print("=" * 70)
