from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

__version__ = "0.3.0"

# Camada tipada gerada a partir do OpenAPI público
from emitfy import generated as generated
from emitfy.generated.models.webhook_create import WebhookCreate
from emitfy.generated.api.webhooks_api import WebhooksApi
from emitfy.generated.api.nfse_api import NfseApi
from emitfy.generated.api_client import ApiClient
from emitfy.generated.configuration import Configuration as OpenApiConfiguration


class EmitfyError(Exception):
    def __init__(
        self,
        message: str,
        code: str | None = None,
        details: Any = None,
        status_code: int = 0,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details
        self.status_code = status_code


class _HttpClient:
    def __init__(
        self,
        api_key: str,
        api_secret: str,
        base_url: str = "https://api.emitfy.com/v1",
        max_retries: int = 2,
    ) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        attempt = 0

        while True:
            attempt += 1
            headers = {
                "X-Api-Key": self.api_key,
                "X-Api-Secret": self.api_secret,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
            if extra_headers:
                headers.update(extra_headers)

            data = None if body is None else json.dumps(body).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())

            try:
                with urllib.request.urlopen(req) as response:
                    raw = response.read().decode("utf-8")
                    status = response.status
                    retry_after = response.headers.get("Retry-After", "1")
            except urllib.error.HTTPError as exc:
                raw = exc.read().decode("utf-8")
                status = exc.code
                retry_after = exc.headers.get("Retry-After", "1") if exc.headers else "1"

            if status == 429 and attempt <= self.max_retries + 1:
                time.sleep(max(1, int(retry_after or "1")))
                continue

            decoded = json.loads(raw) if raw else None

            if status >= 400:
                error = (decoded or {}).get("error") if isinstance(decoded, dict) else None
                message = (
                    error.get("message")
                    if isinstance(error, dict)
                    else "Request failed."
                )
                raise EmitfyError(
                    str(message),
                    error.get("code") if isinstance(error, dict) else None,
                    error.get("details") if isinstance(error, dict) else None,
                    status,
                )

            if isinstance(decoded, dict) and "data" in decoded:
                return decoded["data"]

            return decoded


class CompanyResource:
    def __init__(self, http: _HttpClient, base_path: str) -> None:
        self._http = http
        self._base_path = base_path

    def list(self, **query: Any) -> Any:
        path = self._base_path
        if query:
            path = f"{path}?{urllib.parse.urlencode(query)}"
        return self._http.request("GET", path)

    def create(self, payload: dict[str, Any], idempotency_key: str | None = None) -> Any:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        return self._http.request("POST", self._base_path, payload, headers)

    def get(self, id: str) -> Any:
        return self._http.request("GET", f"{self._base_path}/{urllib.parse.quote(id)}")

    def update(self, id: str, payload: dict[str, Any]) -> Any:
        return self._http.request("PUT", f"{self._base_path}/{urllib.parse.quote(id)}", payload)

    def delete(self, id: str) -> Any:
        return self._http.request("DELETE", f"{self._base_path}/{urllib.parse.quote(id)}")

    def post(
        self,
        suffix: str,
        payload: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        return self._http.request(
            "POST",
            f"{self._base_path.rstrip('/')}/{suffix.lstrip('/')}",
            payload,
            headers,
        )


class CompanyContext:
    def __init__(self, http: _HttpClient, company_id: str) -> None:
        self._http = http
        self._company_id = company_id
        prefix = f"/companies/{urllib.parse.quote(company_id)}"
        self.nfse = CompanyResource(http, f"{prefix}/nfse")
        self.nfe = CompanyResource(http, f"{prefix}/nfe")
        self.nfce = CompanyResource(http, f"{prefix}/nfce")
        self.cte = CompanyResource(http, f"{prefix}/cte")
        self.customers = CompanyResource(http, f"{prefix}/customers")
        self.products = CompanyResource(http, f"{prefix}/products")
        self.sales = CompanyResource(http, f"{prefix}/sales")
        self.invoices = CompanyResource(http, f"{prefix}/invoices")
        self.received_nfes = CompanyResource(http, f"{prefix}/received-nfes")

    def id(self) -> str:
        return self._company_id

    def create_cte_os(
        self, payload: dict[str, Any], idempotency_key: str | None = None
    ) -> Any:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        return self._http.request(
            "POST",
            f"/companies/{urllib.parse.quote(self._company_id)}/cte-os",
            payload,
            headers,
        )


class Emitfy:
    def __init__(
        self,
        api_key: str,
        api_secret: str,
        base_url: str = "https://api.emitfy.com/v1",
        max_retries: int = 2,
    ) -> None:
        api_key = (api_key or "").strip()
        api_secret = (api_secret or "").strip()
        if not api_key or not api_secret:
            raise EmitfyError("api_key and api_secret are required.")
        self._http = _HttpClient(api_key, api_secret, base_url, max_retries)
        self.webhooks = _Webhooks(self._http)
        self.companies = _Companies(self._http)
        self._open_api_config = OpenApiConfiguration(host=base_url.rstrip("/"))
        self._open_api_config.api_key["ApiKeyAuth"] = api_key
        self._open_api_config.api_key["ApiSecretAuth"] = api_secret

    def open_api_client(self) -> ApiClient:
        """Client OpenAPI tipado (`emitfy.generated.*`)."""
        return ApiClient(self._open_api_config)

    def webhooks_api(self) -> WebhooksApi:
        return WebhooksApi(self.open_api_client())

    def company(self, company_id: str) -> CompanyContext:
        company_id = (company_id or "").strip()
        if not company_id:
            raise EmitfyError("company_id is required.")
        return CompanyContext(self._http, company_id)


class _Webhooks:
    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> Any:
        return self._http.request("GET", "/webhooks")

    def create(self, payload: dict[str, Any]) -> Any:
        return self._http.request("POST", "/webhooks", payload)

    def update(self, id: str, payload: dict[str, Any]) -> Any:
        return self._http.request("PUT", f"/webhooks/{urllib.parse.quote(id)}", payload)

    def set_active(self, id: str, active: bool) -> Any:
        return self._http.request(
            "PATCH",
            f"/webhooks/{urllib.parse.quote(id)}/active",
            {"active": active},
        )

    def delete(self, id: str) -> Any:
        return self._http.request("DELETE", f"/webhooks/{urllib.parse.quote(id)}")


class _Companies:
    def __init__(self, http: _HttpClient) -> None:
        self._http = http

    def list(self) -> Any:
        return self._http.request("GET", "/companies")

    def create(self, payload: dict[str, Any]) -> Any:
        return self._http.request("POST", "/companies", payload)


__all__ = [
    "Emitfy",
    "EmitfyError",
    "CompanyContext",
    "generated",
    "WebhookCreate",
    "WebhooksApi",
    "NfseApi",
    "ApiClient",
    "OpenApiConfiguration",
]
