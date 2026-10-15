# Market data fixtures

Synthetic offline Binance symbol-price ticker examples; no live exchange capture, credentials, or market-freshness claim.

Schema reference: [Binance symbol price ticker](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market).

The normalization tests embed these files with include_bytes! and construct malformed cases in memory so duplicate fields and invalid UTF-8 remain intact. No fixture generation requires a service or clock.
