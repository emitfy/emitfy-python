# emitfy (Python)

Official Emitfy API SDK for Python.

```bash
pip install emitfy
```

```python
from emitfy import Emitfy
import os

emitfy = Emitfy(os.environ["EMITFY_API_KEY"], os.environ["EMITFY_API_SECRET"])
emitfy.webhooks.create({
    "url": "https://seu-sistema.com/webhooks/emitfy",
    "events": {"invoice": ["nfse.authorized"], "cte": []},
})
company = emitfy.company(os.environ["EMITFY_COMPANY_ID"])
company.nfse.create({"serviceDescription": "Serviço", "amount": 100})
```

Docs: https://api.emitfy.com/docs/sdks
