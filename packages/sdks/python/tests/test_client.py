"""Tests for Koine client factory."""

import pytest

from koine_sdk import KoineConfig, KoineError, create_koine


class TestCreateKoine:
    def test_creates_client(self):
        config = KoineConfig(
            base_url="http://localhost:3100",
            timeout=30.0,
            auth_key="test-key",
        )
        koine = create_koine(config)

        # Verify client has expected methods
        assert hasattr(koine, "generate_text")
        assert hasattr(koine, "generate_object")
        assert hasattr(koine, "stream_text")

    def test_invalid_config_missing_base_url(self):
        config = KoineConfig(
            base_url="",
            timeout=30.0,
            auth_key="test-key",
        )
        with pytest.raises(KoineError) as exc_info:
            create_koine(config)

        assert exc_info.value.code == "INVALID_CONFIG"
        assert "base_url" in str(exc_info.value)

    def test_invalid_config_missing_auth_key(self):
        config = KoineConfig(
            base_url="http://localhost:3100",
            timeout=30.0,
            auth_key="",
        )
        with pytest.raises(KoineError) as exc_info:
            create_koine(config)

        assert exc_info.value.code == "INVALID_CONFIG"
        assert "auth_key" in str(exc_info.value)

    def test_invalid_config_negative_timeout(self):
        config = KoineConfig(
            base_url="http://localhost:3100",
            timeout=-1.0,
            auth_key="test-key",
        )
        with pytest.raises(KoineError) as exc_info:
            create_koine(config)

        assert exc_info.value.code == "INVALID_CONFIG"
        assert "timeout" in str(exc_info.value)

    def test_invalid_config_zero_timeout(self):
        config = KoineConfig(
            base_url="http://localhost:3100",
            timeout=0.0,
            auth_key="test-key",
        )
        with pytest.raises(KoineError) as exc_info:
            create_koine(config)

        assert exc_info.value.code == "INVALID_CONFIG"

    def test_config_with_model(self):
        config = KoineConfig(
            base_url="http://localhost:3100",
            timeout=30.0,
            auth_key="test-key",
            model="sonnet",
        )
        koine = create_koine(config)
        assert koine is not None

    def test_config_without_model(self):
        config = KoineConfig(
            base_url="http://localhost:3100",
            timeout=30.0,
            auth_key="test-key",
        )
        koine = create_koine(config)
        assert koine is not None
