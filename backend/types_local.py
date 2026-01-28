
from sqlalchemy.types import TypeDecorator, JSON, Text
import json

class JSONEncodedDict(TypeDecorator):
    """JSON 存储类型，兼容 SQLite (TEXT) 和 MySQL (JSON)
    并且支持 Mutation Tracking (需要配合 MutableDict 使用)
    """
    impl = Text  # 默认使用 Text 存储 (SQLite)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mysql":
            return dialect.type_descriptor(JSON)
        return dialect.type_descriptor(Text)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "mysql":
            return value
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "mysql":
            return value
        if isinstance(value, dict):
             return value
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return {}
