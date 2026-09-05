"""Corpus v2.1 — multi-hypothesis, invariant-inference tasks
(user rules 2026-08-02).

Structural changes from v2:
- The codebase is presented as SECTIONS (logical files); the model
  replies with only the function definition(s) it wants to replace
  (5-20 line patches), spliced in by AST position.
- No per-function specs: the module docstring states business goals,
  invariants are scattered across comments, examples, data structures,
  and healthy code.
- Every task ships >=2 DECOY patches that pass 100% of public tests
  but fail hidden tests with DIFFERENT failure profiles — verified
  mechanically. That is the multi-hypothesis property.
"""

from __future__ import annotations

import ast

from pydantic import BaseModel, Field


class FixTaskV21(BaseModel):
    name: str
    goal: str                              # module-level purpose only
    sections: dict[str, str]               # filename -> source
    correct_patch: str                     # reference, never shown
    decoy_patches: dict[str, str]          # label -> patch snippet
    public_tests: list[str]
    hidden_pricing: list[str] = Field(default_factory=list)
    hidden_cache: list[str] = Field(default_factory=list)
    hidden_combo: list[str] = Field(default_factory=list)
    regression_tests: list[str] = Field(default_factory=list)

    def assembled(self) -> str:
        return "\n\n".join(self.sections.values())

    def hidden_all(self) -> list[str]:
        return (self.hidden_pricing + self.hidden_cache
                + self.hidden_combo + self.regression_tests)


def patch_module(assembled: str, patch_code: str) -> str | None:
    """Replace same-named top-level functions with the patch's
    definitions. Returns the new source, or None if the patch defines
    no known function or does not parse."""
    try:
        patch_tree = ast.parse(patch_code)
        base_tree = ast.parse(assembled)
    except SyntaxError:
        return None
    patch_funcs = {n.name: n for n in patch_tree.body
                   if isinstance(n, ast.FunctionDef)}
    if not patch_funcs:
        return None
    base_lines = assembled.splitlines()
    spans = []          # (start_idx, end_idx, name)
    for node in base_tree.body:
        if (isinstance(node, ast.FunctionDef)
                and node.name in patch_funcs):
            spans.append((node.lineno - 1, node.end_lineno, node.name))
    if len(spans) < len(patch_funcs):
        return None     # patch invents an unknown function
    out = []
    prev = 0
    for start, end, name in sorted(spans):
        out.extend(base_lines[prev:start])
        out.append(ast.get_source_segment(patch_code,
                                          patch_funcs[name]))
        prev = end
    out.extend(base_lines[prev:])
    return "\n".join(out)


# ------------------------------------------------------------ flagship

STORE_GOAL = """A small storefront backend. Orders are placed against a
shared catalog, may receive one order-level discount, can be partially
cancelled, and feed a daily revenue report. Customers see display
prices; accounting settles on exact amounts. Reports must never show
stale or wrong revenue. Example session:
    store = make_store({"tea": {"price": 2.5, "stock": 10}})
    oid = place_order(store, {"tea": 2})
    set_discount(store, oid, 0.1)
    daily_report(store)  ->  {"orders": 1, "revenue": 4.5}
Fix the bug(s). Reply with ONLY the corrected function definition(s)."""

STORE_SECTIONS = {
    "store.py": '''# store.py — shared state.
# report_cache holds the last computed report; any change to orders or
# catalog quantities must leave the cache either correct or cleared.
def make_store(catalog):
    return {
        "catalog": {k: dict(v) for k, v in catalog.items()},
        "orders": {},
        "next_id": 1,
        "report_cache": None,
    }


def invalidate_report(store):
    store["report_cache"] = None
''',
    "pricing.py": '''# pricing.py — money handling.
# Display prices are rounded per line for the UI. Settlement works on
# exact line amounts; only the final settled figure is rounded.
def line_display(price, qty):
    return round(price * qty, 2)


def order_display_total(store, oid):
    order = store["orders"][oid]
    catalog = store["catalog"]
    return round(sum(line_display(catalog[n]["price"], q)
                     for n, q in order["lines"].items()), 2)


def order_settle_total(store, oid):
    order = store["orders"][oid]
    catalog = store["catalog"]
    subtotal = sum(line_display(catalog[n]["price"], q)
                   for n, q in order["lines"].items())
    return round(subtotal * (1 - order["discount"]), 2)
''',
    "orders.py": '''# orders.py — order lifecycle.
def place_order(store, items):
    catalog = store["catalog"]
    for name, qty in items.items():
        if qty <= 0:
            raise ValueError("bad qty")
        if name not in catalog or catalog[name]["stock"] < qty:
            raise ValueError("out of stock")
    for name, qty in items.items():
        catalog[name]["stock"] -= qty
    oid = store["next_id"]
    store["next_id"] += 1
    store["orders"][oid] = {"lines": dict(items), "discount": 0.0}
    invalidate_report(store)
    return oid


def set_discount(store, oid, pct):
    if not (0 <= pct <= 0.5):
        raise ValueError("bad discount")
    store["orders"][oid]["discount"] = pct
    invalidate_report(store)


def cancel_units(store, oid, name, qty):
    order = store["orders"][oid]
    if name not in order["lines"] or qty <= 0:
        raise ValueError("bad cancel")
    if qty > order["lines"][name]:
        raise ValueError("bad cancel")
    store["catalog"][name]["stock"] += qty
    order["lines"][name] -= qty
    if order["lines"][name] == 0:
        del order["lines"][name]
''',
    "report.py": '''# report.py — daily numbers for the dashboard.
def daily_report(store):
    if store["report_cache"] is not None:
        return store["report_cache"]
    live = {oid for oid, o in store["orders"].items() if o["lines"]}
    revenue = round(sum(order_settle_total(store, oid)
                        for oid in live), 2)
    report = {"orders": len(live), "revenue": revenue}
    store["report_cache"] = report
    return report
''',
}

# Real bugs: (A) order_settle_total builds its subtotal from per-line
# DISPLAY roundings; (B) cancel_units never invalidates the report
# cache. They interact through daily_report.
STORE_CORRECT = '''def order_settle_total(store, oid):
    order = store["orders"][oid]
    catalog = store["catalog"]
    subtotal = sum(catalog[n]["price"] * q
                   for n, q in order["lines"].items())
    return round(subtotal * (1 - order["discount"]), 2)


def cancel_units(store, oid, name, qty):
    order = store["orders"][oid]
    if name not in order["lines"] or qty <= 0:
        raise ValueError("bad cancel")
    if qty > order["lines"][name]:
        raise ValueError("bad cancel")
    store["catalog"][name]["stock"] += qty
    order["lines"][name] -= qty
    if order["lines"][name] == 0:
        del order["lines"][name]
    invalidate_report(store)
'''

STORE_DECOYS = {
    # hypothesis: "the pricing math is the whole story" — the real
    # settle fix alone. Passes every public test; the cache bug's
    # hidden and combo tests still fail.
    "fix_settle_only": '''def order_settle_total(store, oid):
    order = store["orders"][oid]
    catalog = store["catalog"]
    subtotal = sum(catalog[n]["price"] * q
                   for n, q in order["lines"].items())
    return round(subtotal * (1 - order["discount"]), 2)
''',
    # hypothesis: "display and settlement disagree — unify BOTH on
    # exact math". Fixes settle, silently breaks the per-line display
    # contract. Passes public (its price points cannot tell), fails a
    # DIFFERENT hidden (display) plus the cache hiddens.
    "unify_exact": '''def order_settle_total(store, oid):
    order = store["orders"][oid]
    catalog = store["catalog"]
    subtotal = sum(catalog[n]["price"] * q
                   for n, q in order["lines"].items())
    return round(subtotal * (1 - order["discount"]), 2)


def order_display_total(store, oid):
    order = store["orders"][oid]
    catalog = store["catalog"]
    return round(sum(catalog[n]["price"] * q
                     for n, q in order["lines"].items()), 2)
''',
}

_S = ('store = make_store({"tea": {"price": 2.5, "stock": 10}, '
      '"jam": {"price": 0.333, "stock": 30}, '
      '"nib": {"price": 0.111, "stock": 50}})\n')

STORE_TASK = FixTaskV21(
    name="storefront",
    goal=STORE_GOAL,
    sections=STORE_SECTIONS,
    correct_patch=STORE_CORRECT,
    decoy_patches=STORE_DECOYS,
    public_tests=[
        _S + 'oid = place_order(store, {"tea": 2})\n'
        'assert store["catalog"]["tea"]["stock"] == 8\n'
        'assert order_display_total(store, oid) == 5.0',
        _S + 'oid = place_order(store, {"tea": 2})\n'
        'set_discount(store, oid, 0.1)\n'
        'assert order_settle_total(store, oid) == 4.5',
        _S + 'oid = place_order(store, {"jam": 3})\n'
        'assert order_display_total(store, oid) == 1.0',
        _S + 'oid = place_order(store, {"tea": 1})\n'
        'assert daily_report(store) == {"orders": 1, "revenue": 2.5}',
        _S + 'oid = place_order(store, {"tea": 4})\n'
        'cancel_units(store, oid, "tea", 4)\n'
        'assert store["catalog"]["tea"]["stock"] == 10',
        _S + 'oid = place_order(store, {"jam": 2})\n'
        'set_discount(store, oid, 0.5)\n'
        'assert order_settle_total(store, oid) == 0.33',
    ],
    hidden_pricing=[
        _S + 'oid = place_order(store, {"jam": 5})\n'
        'set_discount(store, oid, 0.2)\n'
        'assert order_settle_total(store, oid) == 1.33',
        _S + 'oid = place_order(store, {"jam": 1, "tea": 1})\n'
        'set_discount(store, oid, 0.2)\n'
        'assert order_settle_total(store, oid) == 2.27',
        _S + 'oid = place_order(store, {"jam": 8, "tea": 1})\n'
        'set_discount(store, oid, 0.1)\n'
        'assert order_settle_total(store, oid) == 4.65',
        _S + 'oid = place_order(store, {"nib": 5, "jam": 5})\n'
        'assert order_display_total(store, oid) == 2.23',
    ],
    hidden_cache=[
        _S + 'oid = place_order(store, {"tea": 4})\n'
        'daily_report(store)\n'
        'cancel_units(store, oid, "tea", 2)\n'
        'assert daily_report(store)["revenue"] == 5.0',
        _S + 'oid = place_order(store, {"tea": 2})\n'
        'daily_report(store)\n'
        'cancel_units(store, oid, "tea", 2)\n'
        'assert daily_report(store) == {"orders": 0, "revenue": 0.0}',
    ],
    hidden_combo=[
        _S + 'oid = place_order(store, {"jam": 10, "tea": 1})\n'
        'set_discount(store, oid, 0.2)\n'
        'daily_report(store)\n'
        'cancel_units(store, oid, "jam", 5)\n'
        'assert daily_report(store)["revenue"] == 3.33',
    ],
    regression_tests=[
        _S + 'try:\n'
        '    place_order(store, {"tea": 20})\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass\n'
        'assert store["catalog"]["tea"]["stock"] == 10',
        _S + 'oid = place_order(store, {"tea": 3})\n'
        'try:\n'
        '    cancel_units(store, oid, "tea", 5)\n'
        '    assert False\n'
        'except ValueError:\n'
        '    pass',
        _S + 'a = place_order(store, {"tea": 1})\n'
        'b = place_order(store, {"tea": 2})\n'
        'assert a != b and len(store["orders"]) == 2',
    ],
)

TASKS_V21: list[FixTaskV21] = [STORE_TASK]
