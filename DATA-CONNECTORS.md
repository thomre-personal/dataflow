# Data connectors

This proposal starts with a stock connector for the personal DataFlow MVP. The
same canvas workflow can support other sources as they are added.

## Connector blocks

A connector is a named source block with a read-only table as its output. It
uses the same connections as other canvas blocks. Tables can look up values by
key, SQL queries can join the output with other tables, and charts can plot it.
The Inspector shows the source, selected items, refresh controls, and when the
data was last updated.

Keep the last successful result when a refresh fails. Show its age along with
the error, and mark missing values so users can see what a calculation includes.
Store connector settings and references in the workspace file. Keep API keys in
connection settings outside the workspace. Cache data locally where the
provider allows it, and check the applicable rights before sharing, publishing,
or carrying those values into a shared cloud workspace.

## First connector: Stocks

1. Add a **Stocks** block and search by company name, ticker, or ISIN.
2. Pick a specific listing. Show the ticker, exchange, and trading currency in
   the results so users can tell different listings apart.
3. Add more listings to the same block. Use **Refresh** to fetch their latest
   available regular-session closing prices.
4. Connect the block to a holdings table. Link each holding to a listing and
   bring in fields such as the closing price. A SQL join can use the same key.

Use one row per selected listing. Give it a stable DataFlow listing ID and
retain the provider's identifier, ticker, exchange, company name, trading
currency, and instrument type. Include the ISIN where available. ISIN is useful
for search and identification. Use the listing ID when the same instrument
trades at several venues or in several currencies.

The price output includes the closing price as traded, the exchange's trading
date, the data source, and the time DataFlow fetched it. Fetch price and trading
date together from the latest daily record. A basic holdings table can use
`Quantity × Close in output currency` to calculate the value of each position.
Cache search results, and reuse the same fetched closing price across blocks.
On a free plan, start with an explicit search and refresh so each call is
predictable.

## Candidate providers

Plan details checked on 24 November 2026.

| Provider | Free plan | Fit for DataFlow |
| --- | --- | --- |
| EODHD | $0, 20 API calls per day. Search and up to one year of daily prices are included. | First choice to test. Search returns name, ticker, exchange, trading currency, and ISIN where available. The provider documents global daily prices and lists Xetra. Company fundamentals are a separate paid dataset. Test the actual portfolio on a free key, including a US and a Xetra listing. [Pricing](https://eodhd.com/pricing/), [Search](https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds), [Daily prices](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes), [Xetra](https://eodhd.com/exchange/xetra) |
| Alpha Vantage | $0, 25 requests per day. The quote endpoint is updated at the end of the trading day by default. | Alternative if the target listings are covered. The symbol search and quote endpoints supply the basic inputs. [Limits](https://www.alphavantage.co/support/), [API documentation](https://www.alphavantage.co/documentation/) |
| Twelve Data | $0, 8 credits per minute and 800 per day. Basic lists internal non-display usage. | Consider a suitable paid plan if we need its coverage or display rights. Grow starts at $29 per month on monthly billing and lists global daily equities and ETF data. Check the intended exchanges and usage rights. [Pricing](https://twelvedata.com/pricing) |

For the personal MVP, use the user's own EODHD key. Search and daily price
requests each cost one API call, so one refresh for 15 uncached listings would
leave five calls that day. EODHD permits private local storage and analysis
under its personal terms. For a shared or commercial DataFlow offering, check
the license for serving prices, derived results, exports, and embeds before
enabling those features. [API limits](https://eodhd.com/financial-apis/api-limits),
[Personal storage rights](https://eodhd.com/help/storage),
[Commercial licensing](https://eodhd.com/financial-apis/commercial-vs-personal-license-use)

## Output currency

Default to **Original currency**. If the user picks an output currency, keep
the original close and add the converted close, output currency, exchange rate,
rate date, and rate source. Normalize quote units such as British pence to the
corresponding currency before conversion. Use a rate of 1 when the currencies
match.

Use the reference rate for the trading date, or the most recent available rate
before it if a currency holiday prevented publication. Show the actual rate
date. Leave the converted value empty with a message when no suitable rate is
available. Round amounts for display after doing the conversion.

Frankfurter v2 provides free, keyless access to daily reference rates. Start
with European Central Bank (ECB) rates for supported currencies and label the
source in the output. These rates support portfolio valuation, while a broker's
actual exchange rate belongs in the transaction record. [Frankfurter API](https://frankfurter.dev/),
[ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)

## Other connector ideas

| Connector | What it makes possible |
| --- | --- |
| Linked CSV or TSV file | Refresh a canvas from a new Numbers export, broker statement, or hobby log without repeating the paste workflow. |
| Exchange rates | Convert expenses and cash balances independently of stock prices, using the same currency source. |
| HTTP JSON or CSV | Bring in data from a public API. Add schema mapping, refresh rules, and credential settings as needed. |
| Google Sheets or Excel Online | Use a shared spreadsheet as a source for an existing workflow. |
| Bank and broker data | Start with statement files for transactions and holdings. Consider account connections once there is a clear need for automatic updates. |
| PostgreSQL and application APIs | Bring governed business data into shared workspaces through read-only connections. |
| Public datasets | Use sources such as Eurostat for economic and demographic data alongside personal or business tables. |

Historical prices are tracked in the [DataFlow TODO list](TODO.md).
