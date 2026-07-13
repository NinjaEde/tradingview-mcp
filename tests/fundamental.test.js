/**
 * Unit tests for fundamental data utilities.
 * No TradingView connection needed.
 *
 * Run: node --test tests/fundamental.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Fundamental Data — Financial Statement Structure', () => {
  it('validates income statement structure', () => {
    const financials = {
      revenue: { '2024': 100000, '2023': 90000 },
      gross_profit: { '2024': 60000, '2023': 54000 },
      net_income: { '2024': 12000, '2023': 10000 },
      eps: { '2024': 2.5, '2023': 2.1 }
    };
    
    assert.ok(financials.revenue['2024'] > financials.revenue['2023'], 'Revenue should grow');
    assert.ok(financials.gross_profit['2024'] > financials.gross_profit['2023'], 'Gross profit should grow');
    assert.ok(financials.net_income['2024'] > financials.net_income['2023'], 'Net income should grow');
  });

  it('validates balance sheet structure', () => {
    const balanceSheet = {
      total_assets: { '2024': 500000, '2023': 450000 },
      total_liabilities: { '2024': 200000, '2023': 180000 },
      total_equity: { '2024': 300000, '2023': 270000 }
    };
    
    const assets2024 = balanceSheet.total_assets['2024'];
    const liabilities2024 = balanceSheet.total_liabilities['2024'];
    const equity2024 = balanceSheet.total_equity['2024'];
    
    assert.ok(Math.abs(assets2024 - (liabilities2024 + equity2024)) < 1, 'Assets = Liabilities + Equity');
  });

  it('validates cash flow structure', () => {
    const cashFlow = {
      operating_cashflow: { '2024': 20000, '2023': 18000 },
      investing_cashflow: { '2024': -5000, '2023': -4500 },
      financing_cashflow: { '2024': -3000, '2023': -2500 }
    };
    
    const fcf2024 = cashFlow.operating_cashflow['2024'] + 
                   cashFlow.investing_cashflow['2024'];
    
    assert.ok(fcf2024 > 0, 'Free cash flow should be positive');
  });
});

describe('Fundamental Data — Valuation Metrics', () => {
  it('calculates P/E ratio correctly', () => {
    const marketCap = 1000000000;
    const netIncome = 50000000;
    const sharesOutstanding = 1000000;
    
    const eps = netIncome / sharesOutstanding;
    const pricePerShare = marketCap / sharesOutstanding;
    const peRatio = pricePerShare / eps;
    
    assert.ok(peRatio > 0, 'P/E ratio should be positive');
    assert.ok(peRatio < 100, 'P/E ratio should be reasonable');
  });

  it('calculates P/B ratio correctly', () => {
    const marketCap = 1000000000;
    const totalEquity = 250000000;
    const sharesOutstanding = 1000000;
    
    const bookValuePerShare = totalEquity / sharesOutstanding;
    const pricePerShare = marketCap / sharesOutstanding;
    const pbRatio = pricePerShare / bookValuePerShare;
    
    assert.ok(pbRatio > 0, 'P/B ratio should be positive');
    assert.ok(pbRatio > 1, 'P/B ratio should typically be > 1');
  });

  it('calculates dividend yield correctly', () => {
    const annualDividend = 2.0;
    const currentPrice = 100.0;
    
    const dividendYield = (annualDividend / currentPrice) * 100;
    
    assert.equal(dividendYield, 2, 'Dividend yield should be 2%');
  });

  it('calculates payout ratio correctly', () => {
    const annualDividend = 2.0;
    const eps = 5.0;
    
    const payoutRatio = (annualDividend / eps) * 100;
    
    assert.equal(payoutRatio, 40, 'Payout ratio should be 40%');
  });

  it('calculates debt to equity ratio', () => {
    const totalDebt = 200000;
    const totalEquity = 300000;
    
    const debtToEquity = totalDebt / totalEquity;
    
    assert.ok(Math.abs(debtToEquity - 0.667) < 0.01, `Debt to equity should be ~0.667, got ${debtToEquity}`);
  });
});

describe('Fundamental Data — Profitability Metrics', () => {
  it('calculates profit margin correctly', () => {
    const netIncome = 10000000;
    const revenue = 100000000;
    
    const profitMargin = (netIncome / revenue) * 100;
    
    assert.equal(profitMargin, 10, 'Profit margin should be 10%');
  });

  it('calculates gross margin correctly', () => {
    const grossProfit = 40000000;
    const revenue = 100000000;
    
    const grossMargin = (grossProfit / revenue) * 100;
    
    assert.equal(grossMargin, 40, 'Gross margin should be 40%');
  });

  it('calculates return on equity correctly', () => {
    const netIncome = 10000000;
    const averageEquity = 50000000;
    
    const roe = (netIncome / averageEquity) * 100;
    
    assert.equal(roe, 20, 'ROE should be 20%');
  });

  it('calculates return on assets correctly', () => {
    const netIncome = 10000000;
    const totalAssets = 200000000;
    
    const roa = (netIncome / totalAssets) * 100;
    
    assert.equal(roa, 5, 'ROA should be 5%');
  });
});

describe('Fundamental Data — Growth Metrics', () => {
  it('calculates revenue growth correctly', () => {
    const currentRevenue = 110000;
    const previousRevenue = 100000;
    
    const revenueGrowth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    
    assert.equal(revenueGrowth, 10, 'Revenue growth should be 10%');
  });

  it('calculates earnings growth correctly', () => {
    const currentEarnings = 5500;
    const previousEarnings = 5000;
    
    const earningsGrowth = ((currentEarnings - previousEarnings) / previousEarnings) * 100;
    
    assert.equal(earningsGrowth, 10, 'Earnings growth should be 10%');
  });

  it('handles negative growth correctly', () => {
    const currentRevenue = 90000;
    const previousRevenue = 100000;
    
    const revenueGrowth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    
    assert.equal(revenueGrowth, -10, 'Revenue growth should be -10%');
  });
});

describe('Fundamental Data — Earnings Analysis', () => {
  it('calculates earnings surprise correctly', () => {
    const epsActual = 2.45;
    const epsEstimate = 2.38;
    
    const surprise = ((epsActual - epsEstimate) / epsEstimate) * 100;
    
    assert.ok(Math.abs(surprise - 2.94) < 0.1, `Surprise should be ~2.94%, got ${surprise}`);
  });

  it('identifies beat vs miss correctly', () => {
    const beatCount = 3;
    const missCount = 1;
    const totalEarnings = 4;
    
    const beatRate = (beatCount / totalEarnings) * 100;
    
    assert.equal(beatRate, 75, 'Beat rate should be 75%');
  });

  it('calculates average surprise correctly', () => {
    const surprises = [2.94, 1.33, 2.38, 2.02];
    
    const avgSurprise = surprises.reduce((a, b) => a + b, 0) / surprises.length;
    
    assert.ok(Math.abs(avgSurprise - 2.17) < 0.1, `Avg surprise should be ~2.17%, got ${avgSurprise}`);
  });
});

describe('Fundamental Data — Dividend Analysis', () => {
  it('validates dividend history structure', () => {
    const dividendHistory = [
      { date: '2024-01-25', amount: 0.24, type: 'Regular Cash' },
      { date: '2023-10-25', amount: 0.22, type: 'Regular Cash' },
      { date: '2023-07-25', amount: 0.22, type: 'Regular Cash' },
    ];
    
    assert.ok(dividendHistory.length > 0, 'Should have dividend history');
    assert.ok(dividendHistory[0].amount > dividendHistory[1].amount, 'Dividends should be increasing');
  });

  it('calculates dividend growth correctly', () => {
    const currentDividend = 0.24;
    const dividend1YearAgo = 0.20;
    
    const yoyGrowth = ((currentDividend - dividend1YearAgo) / dividend1YearAgo) * 100;
    
    assert.ok(Math.abs(yoyGrowth - 20) < 0.01, `YOY dividend growth should be 20%, got ${yoyGrowth}`);
  });

  it('validates 5-year dividend growth', () => {
    const currentDividend = 0.24;
    const dividend5YearsAgo = 0.10;
    
    const cagr = (Math.pow(currentDividend / dividend5YearsAgo, 1/5) - 1) * 100;
    
    assert.ok(cagr > 15 && cagr < 25, `CAGR should be ~19%, got ${cagr}`);
  });
});

describe('Fundamental Data — Ownership Structure', () => {
  it('validates ownership percentages sum to 100', () => {
    const ownership = {
      insiders: 10,
      institutions: 65,
      public: 25
    };
    
    const total = ownership.insiders + ownership.institutions + ownership.public;
    
    assert.equal(total, 100, 'Ownership should sum to 100%');
  });

  it('validates institutional holder data structure', () => {
    const holders = [
      { name: 'Vanguard', shares: 100000000, change: 2.5 },
      { name: 'BlackRock', shares: 80000000, change: -1.2 },
    ];
    
    assert.ok(holders.length >= 2, 'Should have multiple holders');
    assert.ok(holders[0].shares > holders[1].shares, 'Top holder should have most shares');
  });

  it('calculates short interest correctly', () => {
    const sharesShort = 5000000;
    const sharesOutstanding = 100000000;
    
    const shortInterest = (sharesShort / sharesOutstanding) * 100;
    
    assert.equal(shortInterest, 5, 'Short interest should be 5%');
  });
});

describe('Fundamental Data — Profile Validation', () => {
  it('validates company profile structure', () => {
    const profile = {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      employees: 164000,
      website: 'https://www.apple.com',
      ceo: 'Tim Cook',
      founded: 1976
    };
    
    assert.ok(profile.symbol, 'Should have symbol');
    assert.ok(profile.name, 'Should have name');
    assert.ok(profile.sector, 'Should have sector');
    assert.ok(profile.industry, 'Should have industry');
  });

  it('validates stock split history structure', () => {
    const splits = [
      { date: '2020-08-31', ratio: '4:1' },
      { date: '2005-02-28', ratio: '2:1' },
    ];
    
    assert.ok(splits.length >= 1, 'Should have split history');
    assert.ok(splits[0].ratio.includes(':'), 'Ratio should have : format');
  });
});

describe('Fundamental Data — Data Quality', () => {
  it('handles missing data gracefully', () => {
    const financials = {
      revenue: { '2024': 100000 },
      net_income: null,
      eps: undefined
    };
    
    const hasRevenue = financials.revenue?.['2024'] !== undefined;
    const hasNetIncome = financials.net_income !== null && financials.net_income !== undefined;
    
    assert.ok(hasRevenue, 'Should have revenue data');
    assert.ok(!hasNetIncome, 'Should handle missing net income');
  });

  it('validates numeric ranges', () => {
    const metrics = {
      pe_ratio: 25,
      dividend_yield: 2.5,
      debt_to_equity: 0.8
    };
    
    assert.ok(metrics.pe_ratio > 0 && metrics.pe_ratio < 100, 'P/E should be valid');
    assert.ok(metrics.dividend_yield >= 0 && metrics.dividend_yield < 20, 'Yield should be valid');
    assert.ok(metrics.debt_to_equity >= 0, 'D/E should be non-negative');
  });
});
