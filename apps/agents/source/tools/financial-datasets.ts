import { z } from 'zod';
import { defineTool } from '@conductor/core';

const API_BASE = 'https://api.financialdatasets.ai';

function getApiKey(): string {
	const apiKey = process.env['FINANCIAL_DATASETS_API_KEY'];
	if (!apiKey) {
		throw new Error(
			'FINANCIAL_DATASETS_API_KEY environment variable is not set. Get your API key from https://financialdatasets.ai'
		);
	}
	return apiKey;
}

async function fetchApi<T>(endpoint: string, params: Record<string, string | number | undefined>): Promise<T> {
	const apiKey = getApiKey();

	// Build query string, filtering out undefined values
	const queryParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			queryParams.set(key, String(value));
		}
	}

	const url = `${API_BASE}${endpoint}?${queryParams.toString()}`;

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'X-API-KEY': apiKey,
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`API error ${response.status}: ${errorText}`);
	}

	return response.json() as Promise<T>;
}

// ============================================================================
// Financial Metrics Snapshot - Real-time valuation & performance metrics
// ============================================================================

interface MetricsSnapshot {
	ticker: string;
	calendar_date: string;
	market_cap: number;
	enterprise_value: number;
	price_to_earnings_ratio: number;
	price_to_book_ratio: number;
	price_to_sales_ratio: number;
	enterprise_value_to_ebitda_ratio: number;
	enterprise_value_to_revenue_ratio: number;
	free_cash_flow_yield: number;
	peg_ratio: number;
	gross_margin: number;
	operating_margin: number;
	net_margin: number;
	return_on_equity: number;
	return_on_assets: number;
	return_on_invested_capital: number;
	asset_turnover: number;
	inventory_turnover: number;
	receivables_turnover: number;
	days_sales_outstanding: number;
	operating_cycle: number;
	working_capital_turnover: number;
	current_ratio: number;
	quick_ratio: number;
	cash_ratio: number;
	operating_cash_flow_ratio: number;
	debt_to_equity: number;
	debt_to_assets: number;
	interest_coverage: number;
	revenue_growth: number;
	earnings_growth: number;
	book_value_growth: number;
	earnings_per_share_growth: number;
	free_cash_flow_growth: number;
	operating_income_growth: number;
	ebitda_growth: number;
	earnings_per_share: number;
	book_value_per_share: number;
	free_cash_flow_per_share: number;
	payout_ratio: number;
}

interface MetricsSnapshotResponse {
	snapshot: MetricsSnapshot;
}

export const financialMetricsSnapshotTool = defineTool({
	name: 'financial_metrics_snapshot',
	description: `Get real-time financial metrics for a US stock ticker. Returns:
- Valuation: P/E, P/B, P/S, EV/EBITDA, EV/Revenue, FCF yield, PEG ratio
- Margins: Gross, operating, net margins
- Returns: ROE, ROA, ROIC
- Efficiency: Asset/inventory/receivables turnover, DSO
- Liquidity: Current, quick, cash ratios
- Leverage: Debt/equity, debt/assets, interest coverage
- Growth: Revenue, earnings, EPS, FCF growth rates
- Per share: EPS, book value, FCF per share`,
	parameters: z.object({
		ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
	}),
	execute: async ({ ticker }) => {
		try {
			const data = await fetchApi<MetricsSnapshotResponse>('/financial-metrics/snapshot', {
				ticker: ticker.toUpperCase(),
			});

			const s = data.snapshot;

			// Format numbers for readability
			const formatPercent = (n: number | null) => n != null ? `${(n * 100).toFixed(1)}%` : null;
			const formatRatio = (n: number | null) => n != null ? n.toFixed(2) : null;
			const formatBillions = (n: number | null) => n != null ? `$${(n / 1e9).toFixed(2)}B` : null;

			return {
				success: true,
				ticker: s.ticker,
				date: s.calendar_date,
				valuation: {
					marketCap: formatBillions(s.market_cap),
					enterpriseValue: formatBillions(s.enterprise_value),
					peRatio: formatRatio(s.price_to_earnings_ratio),
					pbRatio: formatRatio(s.price_to_book_ratio),
					psRatio: formatRatio(s.price_to_sales_ratio),
					evToEbitda: formatRatio(s.enterprise_value_to_ebitda_ratio),
					evToRevenue: formatRatio(s.enterprise_value_to_revenue_ratio),
					fcfYield: formatPercent(s.free_cash_flow_yield),
					pegRatio: formatRatio(s.peg_ratio),
				},
				margins: {
					gross: formatPercent(s.gross_margin),
					operating: formatPercent(s.operating_margin),
					net: formatPercent(s.net_margin),
				},
				returns: {
					roe: formatPercent(s.return_on_equity),
					roa: formatPercent(s.return_on_assets),
					roic: formatPercent(s.return_on_invested_capital),
				},
				efficiency: {
					assetTurnover: formatRatio(s.asset_turnover),
					inventoryTurnover: formatRatio(s.inventory_turnover),
					receivablesTurnover: formatRatio(s.receivables_turnover),
					dso: s.days_sales_outstanding?.toFixed(0),
				},
				liquidity: {
					currentRatio: formatRatio(s.current_ratio),
					quickRatio: formatRatio(s.quick_ratio),
					cashRatio: formatRatio(s.cash_ratio),
				},
				leverage: {
					debtToEquity: formatRatio(s.debt_to_equity),
					debtToAssets: formatRatio(s.debt_to_assets),
					interestCoverage: formatRatio(s.interest_coverage),
				},
				growth: {
					revenue: formatPercent(s.revenue_growth),
					earnings: formatPercent(s.earnings_growth),
					eps: formatPercent(s.earnings_per_share_growth),
					fcf: formatPercent(s.free_cash_flow_growth),
					bookValue: formatPercent(s.book_value_growth),
				},
				perShare: {
					eps: s.earnings_per_share?.toFixed(2),
					bookValue: s.book_value_per_share?.toFixed(2),
					fcf: s.free_cash_flow_per_share?.toFixed(2),
					payoutRatio: formatPercent(s.payout_ratio),
				},
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Financial Statements - Income, Balance Sheet, Cash Flow
// ============================================================================

interface FinancialStatement {
	ticker: string;
	report_period: string;
	period: string;
	fiscal_year: number;
	fiscal_period: string;
	currency: string;
	// Income statement fields
	revenue?: number;
	cost_of_revenue?: number;
	gross_profit?: number;
	operating_income?: number;
	net_income?: number;
	earnings_per_share?: number;
	earnings_per_share_diluted?: number;
	// Balance sheet fields
	total_assets?: number;
	current_assets?: number;
	cash_and_equivalents?: number;
	total_liabilities?: number;
	current_liabilities?: number;
	total_debt?: number;
	shareholders_equity?: number;
	outstanding_shares?: number;
	// Cash flow fields
	net_cash_flow_from_operations?: number;
	capital_expenditure?: number;
	free_cash_flow?: number;
	dividends_paid?: number;
}

interface FinancialsResponse {
	financials: FinancialStatement[];
}

export const financialStatementsTool = defineTool({
	name: 'financial_statements',
	description: `Get financial statements (income statement, balance sheet, cash flow) for a US company.
Returns revenue, profit margins, assets, liabilities, cash flows, and per-share metrics.
Supports annual, quarterly, or trailing twelve months (TTM) data. US stocks only.`,
	parameters: z.object({
		ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
		period: z.enum(['annual', 'quarterly', 'ttm']).default('annual').describe('Time period for statements'),
		limit: z.number().optional().default(4).describe('Number of periods to return (default: 4)'),
	}),
	execute: async ({ ticker, period, limit }) => {
		try {
			const data = await fetchApi<FinancialsResponse>('/financials', {
				ticker: ticker.toUpperCase(),
				period,
				limit,
			});

			// Handle different response structures from the API
			const financials = data.financials ?? (data as unknown as { income_statements?: FinancialStatement[] }).income_statements ?? [];

			if (!Array.isArray(financials) || financials.length === 0) {
				return {
					success: false,
					error: `No financial data found for ${ticker}. Response keys: ${Object.keys(data).join(', ')}`,
				};
			}

			const formatMillions = (n: number | undefined) => n != null ? `$${(n / 1e6).toFixed(1)}M` : null;
			const formatBillions = (n: number | undefined) => n != null ? `$${(n / 1e9).toFixed(2)}B` : null;

			const statements = financials.map((f) => ({
				period: f.report_period,
				fiscalPeriod: f.fiscal_period,
				fiscalYear: f.fiscal_year,
				income: {
					revenue: formatBillions(f.revenue),
					costOfRevenue: formatBillions(f.cost_of_revenue),
					grossProfit: formatBillions(f.gross_profit),
					operatingIncome: formatBillions(f.operating_income),
					netIncome: formatBillions(f.net_income),
					eps: f.earnings_per_share?.toFixed(2),
					epsDiluted: f.earnings_per_share_diluted?.toFixed(2),
				},
				balanceSheet: {
					totalAssets: formatBillions(f.total_assets),
					currentAssets: formatBillions(f.current_assets),
					cash: formatBillions(f.cash_and_equivalents),
					totalLiabilities: formatBillions(f.total_liabilities),
					currentLiabilities: formatBillions(f.current_liabilities),
					totalDebt: formatBillions(f.total_debt),
					shareholdersEquity: formatBillions(f.shareholders_equity),
					sharesOutstanding: f.outstanding_shares ? `${(f.outstanding_shares / 1e9).toFixed(2)}B` : null,
				},
				cashFlow: {
					operatingCashFlow: formatBillions(f.net_cash_flow_from_operations),
					capex: formatMillions(f.capital_expenditure),
					freeCashFlow: formatBillions(f.free_cash_flow),
					dividendsPaid: formatMillions(f.dividends_paid),
				},
			}));

			return {
				success: true,
				ticker: ticker.toUpperCase(),
				period,
				statementCount: statements.length,
				statements,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Stock Prices - Historical price data
// ============================================================================

interface PriceData {
	open: number;
	close: number;
	high: number;
	low: number;
	volume: number;
	time: string;
}

interface PricesResponse {
	prices: PriceData[];
}

export const stockPricesTool = defineTool({
	name: 'stock_prices',
	description: `Get historical stock prices for US stocks. Returns OHLCV data (open, high, low, close, volume).
Useful for analyzing price trends, calculating returns, or checking recent performance. US stocks only.`,
	parameters: z.object({
		ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
		interval: z.enum(['day', 'week', 'month']).default('day').describe('Time interval for price bars'),
		startDate: z.string().describe('Start date in YYYY-MM-DD format'),
		endDate: z.string().describe('End date in YYYY-MM-DD format'),
		limit: z.number().optional().default(100).describe('Maximum number of price bars (default: 100, max: 5000)'),
	}),
	execute: async ({ ticker, interval, startDate, endDate, limit }) => {
		try {
			const data = await fetchApi<PricesResponse>('/prices', {
				ticker: ticker.toUpperCase(),
				interval,
				interval_multiplier: 1,
				start_date: startDate,
				end_date: endDate,
				limit: Math.min(limit ?? 100, 5000),
			});

			const prices = data.prices.map((p) => ({
				date: p.time.split('T')[0],
				open: p.open.toFixed(2),
				high: p.high.toFixed(2),
				low: p.low.toFixed(2),
				close: p.close.toFixed(2),
				volume: p.volume > 1e6 ? `${(p.volume / 1e6).toFixed(1)}M` : p.volume.toLocaleString(),
			}));

			// Calculate summary stats
			const closes = data.prices.map(p => p.close);
			const firstClose = closes[0];
			const lastClose = closes[closes.length - 1];
			const change = firstClose && lastClose ? ((lastClose - firstClose) / firstClose * 100).toFixed(2) : null;
			const high52w = Math.max(...closes);
			const low52w = Math.min(...closes);

			return {
				success: true,
				ticker: ticker.toUpperCase(),
				interval,
				dateRange: { start: startDate, end: endDate },
				priceCount: prices.length,
				summary: {
					periodChange: change ? `${change}%` : null,
					periodHigh: high52w.toFixed(2),
					periodLow: low52w.toFixed(2),
					latestClose: lastClose?.toFixed(2),
				},
				prices,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Insider Trades - Track insider buying/selling activity
// ============================================================================

interface InsiderTrade {
	ticker: string;
	issuer: string;
	name: string;
	title: string;
	is_board_director: boolean;
	transaction_date: string;
	transaction_shares: number;
	transaction_price_per_share: number;
	transaction_value: number;
	shares_owned_before_transaction: number;
	shares_owned_after_transaction: number;
	security_title: string;
	filing_date: string;
}

interface InsiderTradesResponse {
	insider_trades: InsiderTrade[];
}

export const insiderTradesTool = defineTool({
	name: 'insider_trades',
	description: `Get insider trading activity for a US company. Shows stock buys and sells by CEOs, CFOs, directors, and other insiders.
Useful for understanding insider sentiment - heavy buying can signal confidence, selling may indicate concerns (or just diversification). US stocks only.`,
	parameters: z.object({
		ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
		limit: z.number().optional().default(20).describe('Number of trades to return (default: 20, max: 1000)'),
	}),
	execute: async ({ ticker, limit }) => {
		try {
			const data = await fetchApi<InsiderTradesResponse>('/insider-trades', {
				ticker: ticker.toUpperCase(),
				limit: Math.min(limit ?? 20, 1000),
			});

			const formatValue = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${n.toLocaleString()}`;

			const trades = data.insider_trades.map((t) => ({
				date: t.transaction_date,
				filingDate: t.filing_date,
				insider: t.name,
				title: t.title,
				isDirector: t.is_board_director,
				action: t.transaction_shares > 0 ? 'BUY' : 'SELL',
				shares: Math.abs(t.transaction_shares).toLocaleString(),
				pricePerShare: `$${t.transaction_price_per_share.toFixed(2)}`,
				totalValue: formatValue(Math.abs(t.transaction_value)),
				sharesAfter: t.shares_owned_after_transaction.toLocaleString(),
			}));

			// Summarize buy vs sell activity
			const buys = data.insider_trades.filter(t => t.transaction_shares > 0);
			const sells = data.insider_trades.filter(t => t.transaction_shares < 0);
			const totalBuyValue = buys.reduce((sum, t) => sum + t.transaction_value, 0);
			const totalSellValue = sells.reduce((sum, t) => sum + Math.abs(t.transaction_value), 0);

			return {
				success: true,
				ticker: ticker.toUpperCase(),
				tradeCount: trades.length,
				summary: {
					buyTransactions: buys.length,
					sellTransactions: sells.length,
					totalBuyValue: formatValue(totalBuyValue),
					totalSellValue: formatValue(totalSellValue),
					netSentiment: buys.length > sells.length ? 'Bullish' : sells.length > buys.length ? 'Bearish' : 'Neutral',
				},
				trades,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Institutional Ownership - See what big investors hold
// ============================================================================

interface InstitutionalHolding {
	ticker: string;
	investor: string;
	report_period: string;
	shares: number;
	market_value: number;
}

interface InstitutionalOwnershipResponse {
	'institutional-ownership': InstitutionalHolding[];
}

export const institutionalOwnershipTool = defineTool({
	name: 'institutional_ownership',
	description: `Get institutional ownership data for a US stock (who owns it) or an investor (what they own).
Shows major institutional holders like Vanguard, BlackRock, Berkshire Hathaway, etc.
Use ticker to see who owns a stock, or investor to see an investor's portfolio. US stocks only.`,
	parameters: z.object({
		ticker: z.string().optional().describe('Stock ticker symbol to see who owns it'),
		investor: z.string().optional().describe('Investor name to see their holdings (e.g., BERKSHIRE_HATHAWAY_INC)'),
		limit: z.number().optional().default(20).describe('Number of results (default: 20)'),
	}),
	execute: async ({ ticker, investor, limit }) => {
		try {
			if (!ticker && !investor) {
				return {
					success: false,
					error: 'Must provide either ticker or investor parameter',
				};
			}

			const params: Record<string, string | number | undefined> = {
				limit: limit ?? 20,
			};

			if (ticker) params['ticker'] = ticker.toUpperCase();
			if (investor) params['investor'] = investor.toUpperCase().replace(/ /g, '_');

			const data = await fetchApi<InstitutionalOwnershipResponse>('/institutional-ownership', params);

			const formatValue = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(1)}M`;

			const holdings = data['institutional-ownership'].map((h) => ({
				ticker: h.ticker,
				investor: h.investor.replace(/_/g, ' '),
				reportPeriod: h.report_period,
				shares: h.shares > 1e6 ? `${(h.shares / 1e6).toFixed(2)}M` : h.shares.toLocaleString(),
				marketValue: formatValue(h.market_value),
			}));

			const totalValue = data['institutional-ownership'].reduce((sum, h) => sum + h.market_value, 0);

			return {
				success: true,
				query: ticker ? `Owners of ${ticker.toUpperCase()}` : `Holdings of ${investor}`,
				holdingCount: holdings.length,
				totalMarketValue: formatValue(totalValue),
				holdings,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Earnings Press Releases
// ============================================================================

interface PressRelease {
	ticker: string;
	title: string;
	url: string;
	date: string;
	text: string;
}

interface PressReleasesResponse {
	press_releases: PressRelease[];
}

export const earningsPressReleasesTool = defineTool({
	name: 'earnings_press_releases',
	description: `Get earnings press releases for a US company. Returns the full text of earnings announcements.
Useful for understanding recent financial performance directly from company statements. US stocks only.`,
	parameters: z.object({
		ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
		limit: z.number().optional().default(3).describe('Number of press releases (default: 3)'),
	}),
	execute: async ({ ticker, limit }) => {
		try {
			const data = await fetchApi<PressReleasesResponse>('/earnings/press-releases', {
				ticker: ticker.toUpperCase(),
			});

			// Truncate long press releases to avoid token explosion
			const maxTextLength = 8000;
			const releases = data.press_releases.slice(0, limit ?? 3).map((pr) => ({
				date: pr.date,
				title: pr.title,
				url: pr.url,
				text: pr.text.length > maxTextLength
					? pr.text.slice(0, maxTextLength) + '\n\n[Content truncated...]'
					: pr.text,
				truncated: pr.text.length > maxTextLength,
			}));

			return {
				success: true,
				ticker: ticker.toUpperCase(),
				releaseCount: releases.length,
				releases,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// SEC Filing Items - Extract specific sections from 10-K, 10-Q, 8-K
// ============================================================================

interface FilingItem {
	number: string;
	name: string;
	text: string;
}

interface FilingItemsResponse {
	ticker: string;
	cik: string;
	filing_type: string;
	accession_number: string;
	year: number;
	quarter?: number;
	items: FilingItem[];
}

export const secFilingItemsTool = defineTool({
	name: 'sec_filing_items',
	description: `Extract specific sections from SEC filings (10-K, 10-Q) for US companies.
Items include:
- Item 1: Business description
- Item 1A: Risk factors
- Item 7: Management's discussion (MD&A)
- Item 7A: Market risk disclosures
Useful for deep due diligence and understanding company risks. US stocks only.`,
	parameters: z.object({
		ticker: z.string().describe('Stock ticker symbol'),
		filingType: z.enum(['10-K', '10-Q']).describe('Type of filing'),
		year: z.number().describe('Filing year (e.g., 2024)'),
		quarter: z.number().optional().describe('Quarter (1-4) - required for 10-Q'),
		items: z.array(z.string()).optional().describe('Specific items to retrieve (e.g., ["Item-1A", "Item-7"]). If not specified, returns all items.'),
	}),
	execute: async ({ ticker, filingType, year, quarter, items }) => {
		try {
			if (filingType === '10-Q' && !quarter) {
				return {
					success: false,
					error: 'Quarter is required for 10-Q filings',
				};
			}

			const params: Record<string, string | number | undefined> = {
				ticker: ticker.toUpperCase(),
				filing_type: filingType,
				year,
			};

			if (quarter) params['quarter'] = quarter;

			const data = await fetchApi<FilingItemsResponse>('/filings/items', params);

			// Filter items if specific ones requested
			let filingItems = data.items;
			if (items && items.length > 0) {
				const requestedItems = items.map(i => i.toLowerCase().replace('item-', 'item ').replace('item', 'item ').trim());
				filingItems = data.items.filter(item =>
					requestedItems.some(req => item.number.toLowerCase().includes(req) || item.name.toLowerCase().includes(req))
				);
			}

			// Truncate long item texts
			const maxItemLength = 15000;
			const formattedItems = filingItems.map((item) => ({
				number: item.number,
				name: item.name,
				text: item.text.length > maxItemLength
					? item.text.slice(0, maxItemLength) + '\n\n[Content truncated...]'
					: item.text,
				truncated: item.text.length > maxItemLength,
				characterCount: item.text.length,
			}));

			return {
				success: true,
				ticker: data.ticker,
				filingType: data.filing_type,
				year: data.year,
				quarter: data.quarter,
				accessionNumber: data.accession_number,
				itemCount: formattedItems.length,
				items: formattedItems,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});
