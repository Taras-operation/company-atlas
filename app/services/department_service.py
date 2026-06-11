from __future__ import annotations

from app.models import Department, DepartmentBrand, DepartmentGeo


def serialize_department(dep: Department) -> dict:
    return {
        "id": dep.id,
        "name": dep.name,
        "short_description": dep.short_description,
        "department_type_id": dep.department_type_id,
        "size_label": dep.size_label,
        "email": dep.email,
        "telegram": dep.telegram,
        "chat_link": dep.chat_link,
        "parent_department_id": dep.parent_department_id,
        "brands": [link.brand_id for link in dep.brand_links],
        "geos": [link.geo_id for link in dep.geo_links],
    }


def replace_department_brands(dep: Department, brand_ids: list[int]) -> None:
    dep.brand_links[:] = [DepartmentBrand(brand_id=brand_id) for brand_id in brand_ids]


def replace_department_geos(dep: Department, geo_ids: list[int]) -> None:
    dep.geo_links[:] = [DepartmentGeo(geo_id=geo_id) for geo_id in geo_ids]
