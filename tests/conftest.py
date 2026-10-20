import pytest

# Ensure gltest handles ExecPromptTemplate seamlessly in direct test mode
try:
    import gltest.direct.wasi_mock as wasi_mock
    _orig_handle_gl_call = wasi_mock._handle_gl_call

    def _patched_handle_gl_call(vm, request):
        if isinstance(request, dict) and "ExecPromptTemplate" in request:
            template_data = request["ExecPromptTemplate"]
            task = template_data.get("task", "") or ""
            input_data = template_data.get("input", "") or ""
            criteria = template_data.get("criteria", "") or ""
            prompt_text = f"{task}\n{input_data}\n{criteria}".strip()
            return wasi_mock._handle_llm_request(vm, {"prompt": prompt_text})
        return _orig_handle_gl_call(vm, request)

    wasi_mock._handle_gl_call = _patched_handle_gl_call
except Exception:
    pass
