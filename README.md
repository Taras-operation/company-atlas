# Company CRM Scaffold

Стартовый каркас Flask-проекта для админки визуализации структуры компании.

## Что уже есть
- app factory
- SQLAlchemy models
- Flask-Login
- Dashboard
- базовый CRUD по отделам
- каркас разделов Люди / Роли / Связи / Настройки / История
- готовая структура по папкам

## Быстрый старт
1. Создай venv и установи зависимости:
   pip install -r requirements.txt
2. Скопируй `.env.example` в `.env`
3. Инициализируй миграции:
   flask --app run.py db init
   flask --app run.py db migrate -m "init"
   flask --app run.py db upgrade
4. Создай admin:
   flask --app run.py seed-admin
5. Запусти проект:
   python run.py

Логин по умолчанию после seed:
- username: admin
- password: admin123

## Что делать дальше
- довести CRUD по людям
- довести CRUD по ролям
- довести CRUD по связям
- добавить inline create
- добавить settings CRUD
- добавить audit details
