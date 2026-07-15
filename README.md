# emitfy

Official Emitfy API SDK for Python (OpenAPI-typed).

## Install

```bash
pip install emitfy
```

## Facade

```python
from emitfy import Emitfy

emitfy = Emitfy(os.environ["EMITFY_API_KEY"], os.environ["EMITFY_API_SECRET"])
company = emitfy.company(os.environ["EMITFY_COMPANY_ID"])
company.nfse.create({"serviceDescription": "Serviço", "amount": 100})
```

## Typed OpenAPI layer

```python
from emitfy import WebhookCreate, WebhooksApi

api = emitfy.webhooks_api()
api.webhooks_create(WebhookCreate(url="https://seu-sistema.com/webhooks/emitfy", events={...}))
```

Docs: https://api.emitfy.com/docs/sdks
