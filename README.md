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
company.nfse.create({
  "name": "Consultoria",
  "category": "consulting",
  "serviceDescription": "Consultoria em tecnologia",
  "cityServiceCode": "02800",
  "amount": 100,
  "borrower": {"name": "Cliente LTDA", "taxId": "12.345.678/0001-90"},
})
```

## Typed OpenAPI layer

```python
from emitfy import WebhookCreate, WebhooksApi

api = emitfy.webhooks_api()
api.webhooks_create(WebhookCreate(url="https://seu-sistema.com/webhooks/emitfy", events={...}))
```

Docs: https://docs.emitfy.com/sdks  
OpenAPI: https://api.emitfy.com/openapi.yaml
