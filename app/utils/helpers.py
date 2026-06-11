from typing import Any


def comma_join(items: list[Any]) -> str:
    return ", ".join(str(item) for item in items if item)
