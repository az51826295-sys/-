"""Corpus v2 pilot: multi-function modules with exactly two
INTERACTING bugs (docs/rookery-exp2-design.md section 1).

Every task carries a reference fix (never shown to the model) so the
test suites are mechanically validated: fixed passes everything, buggy
fails >=1 public and >=1 hidden, regression tests pass on BOTH, and the
flagship task proves that a bug-1-only partial fix breaks interaction
tests. Test snippets may span multiple lines (setup + asserts).
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class FixTaskV2(BaseModel):
    name: str
    description: str
    buggy_code: str
    fixed_code: str
    partial_fix_code: str | None = None    # bug 1 fixed, bug 2 intact
    public_tests: list[str]
    hidden_tests: list[str]                # partial fixes, combos
    regression_tests: list[str]            # buggy must ALSO pass these
    interaction_tests: list[str]           # sequences needing both fixes

    def all_final_tests(self) -> list[str]:
        return (self.hidden_tests + self.regression_tests
                + self.interaction_tests)


ORDER_DESC = """Order pipeline over a shared catalog.
create_order(catalog, items): items is {name: qty}; validate every qty > 0
and stock sufficient (else ValueError, catalog unchanged), then decrement
catalog stock and return {"lines": dict(items), "discount": 0.0}.
apply_discount(order, pct): 0 <= pct <= 0.5 else ValueError.
order_total(order, catalog): sum of price*qty over lines, discount applied
to the subtotal, and the FINAL result rounded to 2 decimals (no
intermediate rounding).
cancel_item(order, catalog, name, qty): cancel qty units (1 <= qty <=
current line qty else ValueError); restore exactly qty units of stock;
drop the line when it reaches zero."""

ORDER_BUGGY = '''def create_order(catalog, items):
    for name, qty in items.items():
        if qty <= 0:
            raise ValueError("bad qty")
        if name not in catalog or catalog[name]["stock"] < qty:
            raise ValueError("out of stock")
    for name, qty in items.items():
        catalog[name]["stock"] -= qty
    return {"lines": dict(items), "discount": 0.0}


def apply_discount(order, pct):
    if not (0 <= pct <= 0.5):
        raise ValueError("bad discount")
    order["discount"] = pct


def order_total(order, catalog):
    subtotal = round(sum(catalog[n]["price"] * q
                         for n, q in order["lines"].items()), 0)
    return round(subtotal * (1 - order["discount"]), 2)


def cancel_item(order, catalog, name, qty):
    if name not in order["lines"] or qty <= 0:
        raise ValueError("bad cancel")
    if qty > order["lines"][name]:
        raise ValueError("bad cancel")
    catalog[name]["stock"] += order["lines"][name]
    order["lines"][name] -= qty
    if order["lines"][name] == 0:
        del order["lines"][name]
'''

ORDER_FIXED = ORDER_BUGGY.replace(
    '''    subtotal = round(sum(catalog[n]["price"] * q
                         for n, q in order["lines"].items()), 0)
    return round(subtotal * (1 - order["discount"]), 2)''',
    '''    subtotal = sum(catalog[n]["price"] * q
                   for n, q in order["lines"].items())
    return round(subtotal * (1 - order["discount"]), 2)''',
).replace(
    '    catalog[name]["stock"] += order["lines"][name]',
    '    catalog[name]["stock"] += qty',
)

ORDER_PARTIAL = ORDER_BUGGY.replace(
    '''    subtotal = round(sum(catalog[n]["price"] * q
                         for n, q in order["lines"].items()), 0)
    return round(subtotal * (1 - order["discount"]), 2)''',
    '''    subtotal = sum(catalog[n]["price"] * q
                   for n, q in order["lines"].items())
    return round(subtotal * (1 - order["discount"]), 2)''',
)

_ORDER_SETUP = ('cat = {"apple": {"price": 0.5, "stock": 10}, '
                '"pen": {"price": 1.25, "stock": 4}}\n')

ORDER_TASK = FixTaskV2(
    name="order_pipeline",
    description=ORDER_DESC,
    buggy_code=ORDER_BUGGY,
    fixed_code=ORDER_FIXED,
    partial_fix_code=ORDER_PARTIAL,
    public_tests=[
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 3})\n'
        'assert order_total(o, cat) == 1.5',
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 2})\n'
        'assert cat["apple"]["stock"] == 8',
        _ORDER_SETUP + 'try:\n'
        '    create_order(cat, {"pen": 5})\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
        _ORDER_SETUP + 'o = create_order(cat, {"pen": 2})\n'
        'cancel_item(o, cat, "pen", 2)\n'
        'assert cat["pen"]["stock"] == 4 and "pen" not in o["lines"]',
    ],
    hidden_tests=[
        _ORDER_SETUP + 'o = create_order(cat, {"pen": 3})\n'
        'apply_discount(o, 0.2)\n'
        'assert order_total(o, cat) == 3.0',
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 3, "pen": 1})\n'
        'apply_discount(o, 0.1)\n'
        'assert order_total(o, cat) == 2.48',
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 4})\n'
        'cancel_item(o, cat, "apple", 1)\n'
        'assert cat["apple"]["stock"] == 7 and o["lines"]["apple"] == 3',
    ],
    regression_tests=[
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 4})\n'
        'apply_discount(o, 0.5)\n'
        'assert order_total(o, cat) == 1.0',
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 1})\n'
        'try:\n'
        '    apply_discount(o, 0.9)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 2})\n'
        'try:\n'
        '    cancel_item(o, cat, "apple", 3)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
    ],
    interaction_tests=[
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 6})\n'
        'cancel_item(o, cat, "apple", 2)\n'
        'assert cat["apple"]["stock"] == 6\n'
        'o2 = create_order(cat, {"apple": 6})\n'
        'assert cat["apple"]["stock"] == 0',
        _ORDER_SETUP + 'o = create_order(cat, {"apple": 5, "pen": 2})\n'
        'cancel_item(o, cat, "apple", 3)\n'
        'apply_discount(o, 0.2)\n'
        'assert order_total(o, cat) == 2.8\n'
        'try:\n'
        '    create_order(cat, {"apple": 9})\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
    ],
)


SKU_DESC = """Inventory ledger with a running cache.
normalize_sku(sku): strip whitespace and lowercase.
record(ledger, cache, sku, qty): append {"sku": normalized, "qty": qty}
to the ledger and add qty into cache under the normalized key (qty may
be negative for refunds).
balance(cache, sku): cached quantity for the normalized sku (0 if absent).
rebuild_cache(ledger): fresh cache from ALL ledger entries (refunds
included)."""

SKU_BUGGY = '''def normalize_sku(sku):
    return sku.strip().lower()


def record(ledger, cache, sku, qty):
    ledger.append({"sku": sku, "qty": qty})
    cache[sku] = cache.get(sku, 0) + qty


def balance(cache, sku):
    key = normalize_sku(sku)
    return cache.get(key, 0)


def rebuild_cache(ledger):
    cache = {}
    for entry in ledger:
        if entry["qty"] > 0:
            cache[entry["sku"]] = cache.get(entry["sku"], 0) + entry["qty"]
    return cache
'''

SKU_FIXED = SKU_BUGGY.replace(
    '''    ledger.append({"sku": sku, "qty": qty})
    cache[sku] = cache.get(sku, 0) + qty''',
    '''    key = normalize_sku(sku)
    ledger.append({"sku": key, "qty": qty})
    cache[key] = cache.get(key, 0) + qty''',
).replace(
    '''        if entry["qty"] > 0:
            cache[entry["sku"]] = cache.get(entry["sku"], 0) + entry["qty"]''',
    '''        cache[entry["sku"]] = cache.get(entry["sku"], 0) + entry["qty"]''',
)

SKU_TASK = FixTaskV2(
    name="sku_cache",
    description=SKU_DESC,
    buggy_code=SKU_BUGGY,
    fixed_code=SKU_FIXED,
    public_tests=[
        'led, cache = [], {}\n'
        'record(led, cache, "ABC ", 5)\n'
        'assert balance(cache, "abc") == 5',
        'led, cache = [], {}\n'
        'record(led, cache, "x1", 3)\n'
        'record(led, cache, "x1", 2)\n'
        'assert balance(cache, "x1") == 5',
        'led, cache = [], {}\n'
        'record(led, cache, "a", 4)\n'
        'assert rebuild_cache(led) == cache',
    ],
    hidden_tests=[
        'led, cache = [], {}\n'
        'record(led, cache, " Widget", 2)\n'
        'record(led, cache, "widget ", 3)\n'
        'assert balance(cache, "WIDGET") == 5',
        'led, cache = [], {}\n'
        'record(led, cache, "p", 5)\n'
        'record(led, cache, "p", -2)\n'
        'assert rebuild_cache(led) == {"p": 3}',
    ],
    regression_tests=[
        'led, cache = [], {}\n'
        'record(led, cache, "kk", 7)\n'
        'assert balance(cache, "kk") == 7',
        'assert normalize_sku("  Ab ") == "ab"',
        'assert rebuild_cache([]) == {}',
    ],
    interaction_tests=[
        'led, cache = [], {}\n'
        'record(led, cache, "SKU9 ", 6)\n'
        'record(led, cache, "sku9", -1)\n'
        'assert balance(cache, "Sku9") == 5\n'
        'assert rebuild_cache(led) == {"sku9": 5}',
    ],
)


SCHED_DESC = """Single-day event calendar in minutes (0..1439).
add_event(cal, day, start, dur): dur > 0 and start + dur <= 1440 else
ValueError; reject with ValueError if it overlaps an existing event on
that day; touching endpoints (one ends exactly when another starts) is
NOT an overlap. Appends (start, dur) to cal[day].
has_conflict(cal, day, start, dur, skip=None): True iff the interval
overlaps any event on the day, ignoring the event at index `skip`.
move_event(cal, day, idx, new_start): revalidate fit and conflicts
EXCLUDING the moved event itself; update in place."""

SCHED_BUGGY = '''def has_conflict(cal, day, start, dur, skip=None):
    end = start + dur
    for i, (s, d) in enumerate(cal.get(day, [])):
        if skip is not None and i == skip:
            continue
        if not (end < s or start > s + d):
            return True
    return False


def add_event(cal, day, start, dur):
    if dur <= 0 or start < 0 or start + dur > 1440:
        raise ValueError("bad interval")
    if has_conflict(cal, day, start, dur):
        raise ValueError("conflict")
    cal.setdefault(day, []).append((start, dur))


def move_event(cal, day, idx, new_start):
    start, dur = cal[day][idx]
    if new_start < 0 or new_start + dur > 1440:
        raise ValueError("bad interval")
    if has_conflict(cal, day, new_start, dur):
        raise ValueError("conflict")
    cal[day][idx] = (new_start, dur)
'''

SCHED_FIXED = SCHED_BUGGY.replace(
    "        if not (end < s or start > s + d):",
    "        if not (end <= s or start >= s + d):",
).replace(
    "    if has_conflict(cal, day, new_start, dur):\n"
    "        raise ValueError(\"conflict\")\n"
    "    cal[day][idx] = (new_start, dur)",
    "    if has_conflict(cal, day, new_start, dur, skip=idx):\n"
    "        raise ValueError(\"conflict\")\n"
    "    cal[day][idx] = (new_start, dur)",
)

SCHED_TASK = FixTaskV2(
    name="scheduler",
    description=SCHED_DESC,
    buggy_code=SCHED_BUGGY,
    fixed_code=SCHED_FIXED,
    public_tests=[
        'cal = {}\n'
        'add_event(cal, "mon", 60, 60)\n'
        'add_event(cal, "mon", 120, 30)\n'
        'assert cal["mon"] == [(60, 60), (120, 30)]',
        'cal = {}\n'
        'add_event(cal, "mon", 100, 50)\n'
        'try:\n'
        '    add_event(cal, "mon", 120, 10)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
        'cal = {}\n'
        'try:\n'
        '    add_event(cal, "tue", 1400, 60)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
    ],
    hidden_tests=[
        'cal = {}\n'
        'add_event(cal, "w", 0, 30)\n'
        'add_event(cal, "w", 30, 30)\n'
        'add_event(cal, "w", 60, 30)\n'
        'assert len(cal["w"]) == 3',
        'cal = {}\n'
        'add_event(cal, "w", 200, 40)\n'
        'move_event(cal, "w", 0, 210)\n'
        'assert cal["w"][0] == (210, 40)',
    ],
    regression_tests=[
        'cal = {}\n'
        'add_event(cal, "f", 500, 100)\n'
        'try:\n'
        '    add_event(cal, "f", 550, 10)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
        'cal = {}\n'
        'add_event(cal, "f", 10, 20)\n'
        'add_event(cal, "sat", 10, 20)\n'
        'assert len(cal["f"]) == 1 and len(cal["sat"]) == 1',
    ],
    interaction_tests=[
        'cal = {}\n'
        'add_event(cal, "d", 0, 60)\n'
        'add_event(cal, "d", 100, 60)\n'
        'move_event(cal, "d", 1, 60)\n'
        'assert cal["d"][1] == (60, 60)',
    ],
)


GRADE_DESC = """Grade book: {student: [scores]}.
add_score(book, student, score): clamp the score into [0, 100], then
append.
average(book, student): arithmetic mean (ValueError on no scores).
average_drop_lowest(book, student): mean after ignoring ONE lowest
score (ValueError if fewer than 2 scores). MUST NOT modify the stored
list."""

GRADE_BUGGY = '''def add_score(book, student, score):
    if score > 100:
        score = 100
    book.setdefault(student, []).append(score)


def average(book, student):
    scores = book.get(student, [])
    if not scores:
        raise ValueError("no scores")
    return sum(scores) / len(scores)


def average_drop_lowest(book, student):
    scores = book.get(student, [])
    if len(scores) < 2:
        raise ValueError("need two scores")
    scores.remove(min(scores))
    return sum(scores) / len(scores)
'''

GRADE_FIXED = GRADE_BUGGY.replace(
    '''    if score > 100:
        score = 100''',
    '''    if score > 100:
        score = 100
    if score < 0:
        score = 0''',
).replace(
    '''    scores.remove(min(scores))
    return sum(scores) / len(scores)''',
    '''    kept = sorted(scores)[1:]
    return sum(kept) / len(kept)''',
)

GRADE_TASK = FixTaskV2(
    name="grade_book",
    description=GRADE_DESC,
    buggy_code=GRADE_BUGGY,
    fixed_code=GRADE_FIXED,
    public_tests=[
        'b = {}\n'
        'add_score(b, "kim", -20)\n'
        'assert b["kim"] == [0]',
        'b = {}\n'
        'add_score(b, "kim", 130)\n'
        'assert b["kim"] == [100]',
        'b = {"lee": [80, 90, 70]}\n'
        'assert average_drop_lowest(b, "lee") == 85.0',
    ],
    hidden_tests=[
        'b = {"a": [60, 80]}\n'
        'assert average_drop_lowest(b, "a") == 80.0\n'
        'assert average_drop_lowest(b, "a") == 80.0',
        'b = {"a": [50, 90, 70]}\n'
        'average_drop_lowest(b, "a")\n'
        'assert b["a"] == [50, 90, 70]',
    ],
    regression_tests=[
        'b = {"z": [10, 20, 30]}\n'
        'assert average(b, "z") == 20.0',
        'b = {}\n'
        'try:\n'
        '    average(b, "none")\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
        'b = {"q": [77]}\n'
        'try:\n'
        '    average_drop_lowest(b, "q")\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
    ],
    interaction_tests=[
        'b = {}\n'
        'add_score(b, "p", -10)\n'
        'add_score(b, "p", 90)\n'
        'add_score(b, "p", 60)\n'
        'assert average_drop_lowest(b, "p") == 75.0\n'
        'assert average(b, "p") == 50.0',
    ],
)


BANK_DESC = """Bank accounts: {name: balance}. Fees round to 2 decimals.
transfer(accts, src, dst, amount): amount > 0; fee = round(amount *
0.01, 2); require balance >= amount + fee (else ValueError, nothing
changes); subtract amount + fee from src, add amount to dst.
batch_transfer(accts, transfers): apply the (src, dst, amount) list
ALL-OR-NOTHING — on any failure the accounts must be exactly as before
the batch."""

BANK_BUGGY = '''def transfer(accts, src, dst, amount):
    if amount <= 0:
        raise ValueError("bad amount")
    fee = round(amount * 0.01, 2)
    if accts.get(src, 0) < amount:
        raise ValueError("insufficient")
    accts[src] = round(accts[src] - amount - fee, 2)
    accts[dst] = round(accts.get(dst, 0) + amount, 2)


def batch_transfer(accts, transfers):
    for src, dst, amount in transfers:
        transfer(accts, src, dst, amount)
'''

BANK_FIXED = BANK_BUGGY.replace(
    '    if accts.get(src, 0) < amount:',
    '    if accts.get(src, 0) < amount + fee:',
).replace(
    '''def batch_transfer(accts, transfers):
    for src, dst, amount in transfers:
        transfer(accts, src, dst, amount)''',
    '''def batch_transfer(accts, transfers):
    snapshot = dict(accts)
    try:
        for src, dst, amount in transfers:
            transfer(accts, src, dst, amount)
    except ValueError:
        accts.clear()
        accts.update(snapshot)
        raise''',
)

BANK_TASK = FixTaskV2(
    name="bank_transfers",
    description=BANK_DESC,
    buggy_code=BANK_BUGGY,
    fixed_code=BANK_FIXED,
    public_tests=[
        'a = {"kim": 100.0, "lee": 0.0}\n'
        'transfer(a, "kim", "lee", 50)\n'
        'assert a == {"kim": 49.5, "lee": 50.0}',
        'a = {"kim": 100.0}\n'
        'try:\n'
        '    transfer(a, "kim", "x", 100)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass\n'
        'assert a == {"kim": 100.0}',
        'a = {"p": 10.0, "q": 5.0}\n'
        'batch_transfer(a, [("p", "q", 2), ("q", "p", 1)])\n'
        'assert a == {"p": 8.98, "q": 5.99}',
    ],
    hidden_tests=[
        'a = {"m": 50.4}\n'
        'try:\n'
        '    transfer(a, "m", "n", 50)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass\n'
        'assert a == {"m": 50.4}',
        'a = {"m": 20.0}\n'
        'transfer(a, "m", "n", 10)\n'
        'assert a["m"] == 9.9',
    ],
    regression_tests=[
        'a = {"z": 5.0}\n'
        'try:\n'
        '    transfer(a, "z", "w", -1)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
        'a = {"z": 300.0, "w": 0.0}\n'
        'transfer(a, "z", "w", 100)\n'
        'assert a == {"z": 199.0, "w": 100.0}',
    ],
    interaction_tests=[
        'a = {"p": 100.0, "q": 1.0}\n'
        'try:\n'
        '    batch_transfer(a, [("p", "q", 50), ("q", "p", 60)])\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass\n'
        'assert a == {"p": 100.0, "q": 1.0}',
        'a = {"p": 10.05, "q": 0.0}\n'
        'try:\n'
        '    batch_transfer(a, [("p", "q", 5), ("p", "q", 5)])\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass\n'
        'assert a == {"p": 10.05, "q": 0.0}',
    ],
)


QUERY_DESC = """Query-string utilities.
parse_query(qs): 'a=1&b=2' -> {'a': '1', 'b': '2'}. A key with an empty
value ('a=') maps to ''. Empty string parses to {}. No '=' in a part
means value ''.
build_query(params): inverse join with '&', keys in insertion order,
every key rendered as key=value (empty values as 'key=').
merge_params(base_qs, override_qs): parse both; keys in override WIN;
result built with base keys first (insertion order), then new override
keys."""

QUERY_BUGGY = '''def parse_query(qs):
    out = {}
    if not qs:
        return out
    for part in qs.split("&"):
        if "=" in part:
            key, value = part.split("=", 1)
            if value:
                out[key] = value
        else:
            out[part] = ""
    return out


def build_query(params):
    return "&".join(f"{k}={v}" for k, v in params.items())


def merge_params(base_qs, override_qs):
    base = parse_query(base_qs)
    override = parse_query(override_qs)
    merged = dict(override)
    merged.update(base)
    return build_query(merged)
'''

QUERY_FIXED = QUERY_BUGGY.replace(
    '''            key, value = part.split("=", 1)
            if value:
                out[key] = value''',
    '''            key, value = part.split("=", 1)
            out[key] = value''',
).replace(
    '''    merged = dict(override)
    merged.update(base)
    return build_query(merged)''',
    '''    merged = dict(base)
    merged.update(override)
    return build_query(merged)''',
)

QUERY_TASK = FixTaskV2(
    name="query_utils",
    description=QUERY_DESC,
    buggy_code=QUERY_BUGGY,
    fixed_code=QUERY_FIXED,
    public_tests=[
        "assert parse_query('a=1&b=2') == {'a': '1', 'b': '2'}",
        "assert parse_query('a=') == {'a': ''}",
        "assert build_query({'x': '1', 'y': ''}) == 'x=1&y='",
        "assert merge_params('a=1', '') == 'a=1'",
    ],
    hidden_tests=[
        "assert parse_query('flag') == {'flag': ''}",
        "assert parse_query('') == {}",
        "assert parse_query(build_query({'k': ''})) == {'k': ''}",
    ],
    regression_tests=[
        "assert parse_query('n=alpha') == {'n': 'alpha'}",
        "assert build_query({}) == ''",
        "assert parse_query('v=a=b') == {'v': 'a=b'}",
    ],
    interaction_tests=[
        "assert merge_params('a=1&b=2', 'b=9') == 'a=1&b=9'",
        "assert merge_params('a=1', 'a=') == 'a='",
    ],
)


TASKS_V2: list[FixTaskV2] = [
    ORDER_TASK, SKU_TASK, SCHED_TASK, GRADE_TASK, BANK_TASK, QUERY_TASK,
]
