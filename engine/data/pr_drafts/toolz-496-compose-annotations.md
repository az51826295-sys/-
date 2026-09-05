# PR draft — pytoolz/toolz  (branch: compose-annotations → master)

## Title
Expose combined `__annotations__` on composed functions (#496)

## Body
`Compose` already synthesizes `__signature__` (parameters of the first function applied, return annotation of the last), but it had no `__annotations__`, so `typing.get_type_hints()` and tools that read `__annotations__` directly saw nothing on a composed callable.

This adds an instance property that builds the same view:

```python
def f(x: int) -> str: ...
def g(y: str) -> float: ...
compose(g, f).__annotations__          # {'x': int, 'return': float}
typing.get_type_hints(compose(g, f))   # {'x': int, 'return': float}
```

Functions without annotations contribute nothing; callables with no `__annotations__` at all (e.g. `str`, arbitrary objects) are handled.

Scope: this is a small runtime step toward the static typing discussed in #496 — the composed callable now reports `Callable[[A], C]` for `compose(g, f)` with `f: A -> B`, `g: B -> C`. It does not add stubs or annotate the library itself; happy to split or drop it if you'd rather approach #496 differently.

Tests: `test_compose_annotations` (combined view, unannotated pieces, `get_type_hints`, consistency with `__signature__`). Full suite incl. doctests passes locally (`pytest --doctest-modules toolz/`; the only failure is `test_has_version`, which needs an installed distribution and fails identically on master in my environment).

Authored with the help of an AI agent (Rookery Alpha), human-reviewed.
