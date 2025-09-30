// src/components/CustomCoinChart.tsx
import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Label
} from 'recharts'; // Make sure Label is imported
import './CustomCoinChart.css';
import { ALL_SUPPORTED_COINS, ALL_SUPPORTED_CURRENCIES } from '../constants/crypto';


import Select from 'react-select';
import type { SingleValue } from 'react-select';


const coinOptions = ALL_SUPPORTED_COINS.map((c) => ({
  value: c.id,
  label: `${c.name} (${c.symbol.toUpperCase()})`,
}));

const currencyOptions = ALL_SUPPORTED_CURRENCIES.map((c) => ({
  value: c.id,
  label: `${c.id.toUpperCase()} ${c.name}`,
}));

interface ChartData {
  time: string;
  price: number;
}

interface CoinDetails {
  id: string;
  name: string;
  symbol: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
}

const CustomCoinChart: React.FC = () => {
  const [selectedCoinId, setSelectedCoinId] = useState('bitcoin');
  const [selectedCurrencyId, setSelectedCurrencyId] = useState('usd');
  const [days] = useState(7); // You might want to make this dynamic later
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [coinDetails, setCoinDetails] = useState<CoinDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string>('');
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);
  const [customWidth, setCustomWidth] = useState("600"); // Increased default width for better visibility
  const [customHeight, setCustomHeight] = useState("400"); // Increased default height

  const [dark, setDark] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [outlined, setOutlined] = useState(true);

  // useRef is not strictly necessary for height directly controlling inline style,
  // but it's good practice for chart area to potentially measure its actual rendered size.
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const [chartAreaHeight, setChartAreaHeight] = useState(customHeight);
  useEffect(() => {
    // This effect ensures chartAreaHeight updates if customHeight changes
    setChartAreaHeight(customHeight);
  }, [customHeight]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchCoinData = async () => {
      setLoading(true);
      setError(null);

      try {
        const detailsRes = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${selectedCoinId}`,
          { signal: signal, params: { localization: false, market_data: true, community_data: false, developer_data: false, sparkline: false } }
        );

        // Safely access nested properties
        const currentPrice = detailsRes.data.market_data?.current_price?.[selectedCurrencyId] || 0;
        const priceChange24h = detailsRes.data.market_data?.price_change_percentage_24h || 0;

        setCoinDetails({
          id: detailsRes.data.id,
          name: detailsRes.data.name,
          symbol: detailsRes.data.symbol.toUpperCase(),
          image: detailsRes.data.image?.small || '', // Handle missing image gracefully
          current_price: currentPrice,
          price_change_percentage_24h: priceChange24h,
        });

        const chartRes = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${selectedCoinId}/market_chart`,
          { params: { vs_currency: selectedCurrencyId, days }, signal: signal }
        );

        // For `days=7`, CoinGecko often returns daily data.
        // If `days` is less (e.g., 1), it's hourly.
        // Adjusting time formatting based on `days` for better X-axis labels
        const formatTime = (timestamp: number) => {
          if (days <= 1) { // If 1 day or less, show hour and minute
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else if (days <= 30) { // If up to 30 days, show date
            return new Date(timestamp).toLocaleDateString();
          } else { // For longer periods, show month and year
            return new Date(timestamp).toLocaleDateString([], { month: 'short', year: 'numeric' });
          }
        };

        const formattedChartData = chartRes.data.prices.map(([timestamp, price]: [number, number]) => ({
          time: formatTime(timestamp),
          price: +price.toFixed(2),
        }));
        setChartData(formattedChartData);

      } catch (err) {
        if (axios.isCancel(err)) {
          console.log('Request canceled:', err.message);
        } else {
          console.error('Error fetching data:', err);
          setError('Failed to fetch data. Please try again.');
          setCoinDetails(null);
          setChartData([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCoinData();

    return () => {
      controller.abort();
    };
  }, [selectedCoinId, selectedCurrencyId, days]);


  const getCurrencySymbol = (currencyId: string) => {
    const currency = ALL_SUPPORTED_CURRENCIES.find(c => c.id === currencyId);
    return currency ? currency.symbol : '';
  };

  const getPriceColor = (percentage: number) => {
    if (percentage > 0) return '#16c784';
    if (percentage < 0) return '#ea3943';
    return 'inherit';
  };

  const generateAnalysis = async () => {
    if (!coinDetails || chartData.length === 0) {
      setAnalysisText("No data available to generate analysis.");
      console.log("Analysis skipped: No coin details or chart data.");
      return;
    }

    setGeneratingAnalysis(true);
    setAnalysisText("Generating analysis...");
    console.log("Starting analysis generation...");

    // Construct prompt with current data
    const prompt = `Provide a brief market analysis for ${coinDetails.name} (${coinDetails.symbol}) in ${selectedCurrencyId.toUpperCase()}.
      Current Price: ${getCurrencySymbol(selectedCurrencyId)}${coinDetails.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
      24h Price Change: ${coinDetails.price_change_percentage_24h.toFixed(2)}%
      Historical data points (last ${days} days, time: price):
      ${chartData.map(d => `${d.time}: ${d.price}`).join('\n')}

      Focus on the recent price movement (up/down trend), volatility, and potential implications based on the provided data. Keep it concise, around 100-150 words.`;

    console.log("Prompt sent to LLM:", prompt);

    try {
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };

      // --- !!! SECURITY WARNING: Do NOT hardcode API keys in production !!! ---
      // This is for demonstration. For a real app, use environment variables
      // (e.g., process.env.NEXT_PUBLIC_GEMINI_API_KEY in Next.js)
      // or a secure backend proxy.
      const apiKey = 'YOUR_GEMINI_API_KEY_HERE'; // Replace with your actual key

      if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
        throw new Error("Gemini API Key is not configured. Please set a valid API key or use environment variables.");
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Fetching from LLM API:", apiUrl);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log("LLM API response status:", response.status);
      if (!response.ok) {
        const errorBody = await response.text();
        console.error("LLM API error response body:", errorBody);
        throw new Error(`LLM API request failed with status ${response.status}: ${errorBody}`);
      }

      const result = await response.json();
      console.log("Raw LLM API result:", result);

      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setAnalysisText(text);
        console.log("Analysis generated successfully.");
      } else {
        setAnalysisText("Failed to generate analysis. Unexpected LLM response structure.");
        console.error("LLM response structure unexpected:", result);
      }
    } catch (llmError: any) {
      setAnalysisText(`Error generating analysis: ${llmError.message || "Unknown error"}. Check console for details.`);
      console.error("Error calling LLM API:", llmError);
    } finally {
      setGeneratingAnalysis(false);
      console.log("Analysis generation finished.");
    }
  };


  const containerClassName = `chart-container`;

  const chartWrapperClassName = `
    chart-wrapper
    ${dark ? 'dark-mode' : ''}
    ${transparent ? 'transparent-bg' : ''}
    ${outlined ? 'outlined' : ''}
  `;

  const selectedCurrencySymbol = getCurrencySymbol(selectedCurrencyId);
  const selectedCoin = ALL_SUPPORTED_COINS.find(c => c.id === selectedCoinId);

  return (
    <div className={containerClassName}>
      {/* Left Section: Chart and Analysis */}
      <div className="chart-and-analysis-section">
        <div className="chart-header-info">
          <h2 className="chart-title">
            {selectedCoin ? `${selectedCoin.name} (${selectedCoin.symbol.toUpperCase()})` : 'Custom Coin Chart'}
          </h2>
          <p className="chart-subtitle">
            Powered by CoinGecko API
          </p>
        </div>
        {/* Chart Wrapper - Themeable */}
        <div className={chartWrapperClassName}>

          {coinDetails && (
            // Added title attribute for hover effect on the entire coin info block
            <div
              className="coin-info"
              title={`${coinDetails.name} (${coinDetails.symbol}) Current Price and 24-hour change.`}
            >
              <div className="coin-header">
                {coinDetails.image && (
                  <img src={coinDetails.image} alt={`${coinDetails.name} logo`} className="coin-logo" />
                )}
                <h3>{coinDetails.name}</h3>
                <span className="coin-symbol">{coinDetails.symbol}/{selectedCurrencyId.toUpperCase()}</span>
              </div>
              <div className="coin-price-info">
                <span className="current-price">
                  {selectedCurrencySymbol}{coinDetails.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </span>
                {coinDetails.price_change_percentage_24h !== 0 && (
                  <span
                    className="price-change-24h"
                    style={{ color: getPriceColor(coinDetails.price_change_percentage_24h) }}
                  >
                    {coinDetails.price_change_percentage_24h > 0 ? '▲' : '▼'}
                    {Math.abs(coinDetails.price_change_percentage_24h).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          )}

          <div
            className="chart-area"
            ref={chartAreaRef}
            // Apply customWidth and customHeight here as inline styles
            style={{
              height: `${chartAreaHeight}px`,
              minHeight: '150px',
              width: `${customWidth}px`, 
              minWidth: '300px'
            }}
          >
            {loading && !chartData.length ? (
              <p className="loading-message">Loading chart data...</p>
            ) : error ? (
              <p className="error-message">{error}</p>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width={parseInt(customWidth, 10) || '100%'} height="100%"  // Add padding for better spacing
              >
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom:19, left: 30 }} >
                  <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#444' : '#eee'} />
                  {/* XAxis with Label */}
                  <XAxis dataKey="time" tick={{ fill: dark ? '#ccc' : '#000' }} label={{ value: 'Time', position: 'bottom', offset: 20 }}> {/* Add tick style for visibility */}
                    <Label
                      value={`Time (Last ${days} Days)`}
                      position="insideBottom"
                      dy={10} // Adjust dy to position the label
                      offset={-5} // Adjust offset to position the label
                      style={{ textAnchor: 'middle', fill: dark ? '#ccc' : '#000' }}
                    />
                  </XAxis>
                  {/* YAxis with Label */}
                 <YAxis
                      domain={['auto', 'auto']}
                      stroke={dark ? '#ccc' : '#000'}
                      tick={{ fill: dark ? '#ccc' : '#000' }}
                    >
                      <Label
                        value={`Price (${selectedCurrencySymbol})`}
                        position="insideLeft"
                        angle={-90}
                        dx={-25} // 👈 shift label further left for spacing
                        style={{
                          textAnchor: 'middle',
                          fill: dark ? '#ccc' : '#000'
                        }}
                      />
                    </YAxis>
                  <Tooltip
                    formatter={(value: number) => `${selectedCurrencySymbol}${value.toLocaleString()}`}
                    labelFormatter={(label: string) => `Time: ${label}`}
                    contentStyle={{
                      backgroundColor: dark ? '#333' : '#fff',
                      borderColor: dark ? '#555' : '#ccc',
                      color: dark ? '#fff' : '#000',
                      borderRadius: '8px',
                    }}
                    itemStyle={{ color: dark ? '#fff' : '#000' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={coinDetails && coinDetails.price_change_percentage_24h < 0 ? '#ea3943' : '#16c784'}
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="no-data-message">No chart data available for this selection.</p>
            )}
          </div>
        </div> {/* End of chart-wrapper */}

        {/* Analysis Section - Now directly below the chart */}
        <div className="analysis-area">
          <h4 className="analysis-title">Market Analysis</h4>
          <button
            onClick={generateAnalysis}
            disabled={loading || generatingAnalysis || !coinDetails || chartData.length === 0}
            className="generate-analysis-button"
          >
            {generatingAnalysis ? 'Generating...' : 'Generate Analysis'}
          </button>
          
        </div>
      </div> {/* End of chart-and-analysis-section */}

      {/* Right Section: Controls Only */}
      <div className="controls-area-wrapper">
        <div className="controls-area">
          <label className="control-label">
            Coin:
            <Select
              options={coinOptions}
              value={coinOptions.find(option => option.value === selectedCoinId)}
              onChange={(selected) => { if (selected) setSelectedCoinId(selected.value); }}
              className="control-select"
              classNamePrefix="custom-select"
              placeholder="Select Coin"
            />
          </label>

          <label className="control-label">
            Currency:
            <Select
              options={currencyOptions}
              value={currencyOptions.find(option => option.value === selectedCurrencyId)}
              onChange={(selected: SingleValue<{ value: string; label: string }>) => {
                if (selected) setSelectedCurrencyId(selected.value);
              }}
              className="control-select"
              placeholder="Select Currency"
              // You had styles here, but they were empty. Keeping for structure.
              styles={{
                menu: (base) => ({
                  ...base,
                }),
              }}
            />
          </label>

          <label className="control-label">
            Width (px):
            <input
              type="number"
              value={customWidth}
              onChange={(e) => {
                    // Allow user to type freely, but ensure it's a number
                    const inputValue = e.target.value;
                    if (inputValue === '' || /^\d+$/.test(inputValue)) { // Allows empty string or digits only
                      setCustomWidth(inputValue);
                    }
                  }}              onBlur={() => {
                const val = Number(customWidth);
                if (!val || val < 600) {
                  setCustomWidth("600");
                } else {
                  setCustomWidth(val.toString());
                }
              }}
              className="control-input"
            />
            <span className="input-hint">Min width 00px</span>
          </label>

          <label className="control-label">
            Height (px):
            <input
              type="number"
              value={customHeight}
              onChange={(e) => setCustomHeight(e.target.value)}
              onBlur={() => {
                const val = Number(customHeight);
                if (!val || val < 150) {
                  setCustomHeight("150");
                } else {
                  setCustomHeight(val.toString());
                }
              }}
              className="control-input"
            />
            <span className="input-hint">Min height 150px</span>
          </label>

          <div className="checkbox-group">
            <label className="control-label checkbox-label">
              <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} className="control-checkbox" />
              Dark Mode
            </label>

            <label className="control-label checkbox-label">
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="control-checkbox" />
              Transparent background
            </label>

            <label className="control-label checkbox-label">
              <input type="checkbox" checked={outlined} onChange={(e) => setOutlined(e.target.checked)} className="control-checkbox" />
              Outlined
            </label>
          </div>
          {analysisText && ( // Only show analysis result if there's text
            <div className="analysis-text-area">
              <h4 className="analysis-title">Analysis Result</h4>
              <p className="analysis-text">
                {analysisText}
              </p>
            </div>
          )}
        </div>
        {/* The analysis result moved inside the controls-area-wrapper */}
      </div>
    </div>
  );
};

export default CustomCoinChart;