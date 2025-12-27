"""Tests for KoineError class and error utilities."""

from koine_sdk import KoineError
from koine_sdk.errors import KNOWN_ERROR_CODES, to_error_code


class TestKoineError:
    def test_construction(self):
        error = KoineError("Something went wrong", "HTTP_ERROR")
        assert str(error) == "Something went wrong"
        assert error.code == "HTTP_ERROR"
        assert error.raw_text is None

    def test_with_raw_text(self):
        error = KoineError("Validation failed", "VALIDATION_ERROR", "raw output")
        assert error.raw_text == "raw output"
        assert repr(error) == "KoineError('VALIDATION_ERROR', 'Validation failed')"


class TestToErrorCode:
    def test_known_code(self):
        assert to_error_code("TIMEOUT", "HTTP_ERROR") == "TIMEOUT"

    def test_unknown_code(self):
        assert to_error_code("UNKNOWN_CODE", "HTTP_ERROR") == "HTTP_ERROR"

    def test_none_code(self):
        assert to_error_code(None, "HTTP_ERROR") == "HTTP_ERROR"

    def test_all_sdk_codes(self):
        sdk_codes = [
            "HTTP_ERROR",
            "INVALID_RESPONSE",
            "INVALID_CONFIG",
            "VALIDATION_ERROR",
            "STREAM_ERROR",
            "SSE_PARSE_ERROR",
            "NO_SESSION",
            "NO_USAGE",
            "NO_OBJECT",
            "NO_RESPONSE_BODY",
            "TIMEOUT",
            "NETWORK_ERROR",
        ]
        for code in sdk_codes:
            assert to_error_code(code, "HTTP_ERROR") == code

    def test_all_gateway_codes(self):
        gateway_codes = [
            "INVALID_PARAMS",
            "AUTH_ERROR",
            "UNAUTHORIZED",
            "SERVER_ERROR",
            "SCHEMA_ERROR",
            "RATE_LIMITED",
            "CONTEXT_OVERFLOW",
        ]
        for code in gateway_codes:
            assert to_error_code(code, "HTTP_ERROR") == code


class TestKnownErrorCodes:
    def test_contains_all_expected_codes(self):
        expected = {
            "HTTP_ERROR",
            "INVALID_RESPONSE",
            "INVALID_CONFIG",
            "VALIDATION_ERROR",
            "STREAM_ERROR",
            "SSE_PARSE_ERROR",
            "NO_SESSION",
            "NO_USAGE",
            "NO_OBJECT",
            "NO_RESPONSE_BODY",
            "TIMEOUT",
            "NETWORK_ERROR",
            "INVALID_PARAMS",
            "AUTH_ERROR",
            "UNAUTHORIZED",
            "SERVER_ERROR",
            "SCHEMA_ERROR",
            "RATE_LIMITED",
            "CONTEXT_OVERFLOW",
        }
        assert expected == KNOWN_ERROR_CODES

    def test_is_frozen(self):
        # Verify the set is immutable
        assert isinstance(KNOWN_ERROR_CODES, frozenset)
