// 注释里带 emoji：遮罩必须按 UTF-16 偏移写，不能吃掉下一行的首字符
// 😀 否则 `JSON.parse(` 会变成 `SON.parse(`，P06 直接漏报
JSON.parse(JSON.stringify(value))
