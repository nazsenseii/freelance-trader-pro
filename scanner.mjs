import fs from 'fs';
import YahooFinance from 'yahoo-finance2';
import { EMA, SMA, BollingerBands } from 'technicalindicators'; 
import { createClient } from '@supabase/supabase-js';

// ==========================================
// 1. CONFIGURATION SUPABASE (GITHUB SECRETS)
// ==========================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Kunci Supabase tidak dijumpai dalam Environment Variables.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const rehatSeketika = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function jalankanScannerMomentum() {
    if (!fs.existsSync('senarai_bursa.json')) {
        console.log("❌ Fail 'senarai_bursa.json' tiada.");
        return;
    }

    const masterList = JSON.parse(fs.readFileSync('senarai_bursa.json', 'utf8'));
    
    // Tapis hanya Induk & Waran Syarikat sahaja
    const senaraiSaham = masterList.filter(item => {
        const baseCode = item.symbol.replace('.KL', '');
        const isMotherShare = /^[A-Z0-9]{3,4}$/i.test(baseCode);
        const isCompanyWarrant = /^[A-Z0-9]{3,4}W[A-Z]?$/i.test(baseCode);
        return isMotherShare || isCompanyWarrant;
    });

    console.log("=====================================================");
    console.log(`🚀 ENJIN MOMENTUM PRO (FULL FA & 2-YEAR CHART ENABLED)`);
    console.log(`📊 JUMLAH SAHAM DIPROSES: ${senaraiSaham.length} Kaunter`);
    console.log("=====================================================\n");

    const tarikhHariNi = new Date();
    const tarikhLama = new Date();
    tarikhLama.setFullYear(tarikhHariNi.getFullYear() - 2); 

    const queryOptions = {
        period1: tarikhLama.toISOString().split('T')[0], 
        period2: tarikhHariNi.toISOString().split('T')[0], 
        interval: '1d' 
    };

    console.log("🧹 Memadamkan rekod lama di Supabase...");
    await supabase.from('hasil_scan').delete().neq('id', 0);

    let jumlahBerjaya = 0;
    const industriHaram = ['bank', 'insurance', 'credit services', 'casino', 'gambling', 'tobacco', 'brewer', 'alcohol', 'liquor'];

    for (let i = 0; i < senaraiSaham.length; i++) {
        let item = senaraiSaham[i];
        let simbol = item.symbol;
        
        console.log(`[${i+1}/${senaraiSaham.length}] Menganalisis ${simbol}...`);
        
        try {
            // Rehat 600ms untuk mengelakkan sekatan IP oleh Yahoo Finance
            await rehatSeketika(600);

            const dataSejarah = await yahooFinance.chart(simbol, queryOptions);
            const senaraiHarga = dataSejarah?.quotes; 
            
            if (!senaraiHarga || senaraiHarga.length < 50) {
                continue; 
            }

            let dataHigh = [], dataLow = [], dataClose = [], dataVolume = [];
            senaraiHarga.forEach(hari => {
                if (hari.high && hari.low && hari.close && hari.volume !== undefined) { 
                    dataHigh.push(hari.high); dataLow.push(hari.low); 
                    dataClose.push(hari.close); dataVolume.push(hari.volume);
                }
            });

            if(dataVolume[dataVolume.length - 1] === 0 && dataVolume[dataVolume.length - 2] === 0) {
                console.log(`    -> ⚠️ DIKETEPIKAN (Tiada Volume/Digantung)`);
                continue;
            }

            const hargaTerkini = dataClose[dataClose.length - 1];
            const volTerkini = dataVolume[dataVolume.length - 1];

            const hasilEMA50 = EMA.calculate({ period: 50, values: dataClose });
            const ema50 = hasilEMA50[hasilEMA50.length - 1];

            const hasilEMA20 = EMA.calculate({ period: 20, values: dataClose });
            const ema20 = hasilEMA20[hasilEMA20.length - 1];

            const hasilSMA200 = SMA.calculate({ period: 200, values: dataClose });
            const sma200 = hasilSMA200.length > 0 ? hasilSMA200[hasilSMA200.length - 1] : 0;

            const hasilBB = BollingerBands.calculate({ period: 10, stdDev: 1, values: dataClose });
            const bb = hasilBB.length > 0 ? hasilBB[hasilBB.length - 1] : { upper: 0, lower: 0 };

            const last20High = dataHigh.slice(-20);
            const high20 = Math.max(...last20High);
            
            const last20Vol = dataVolume.slice(-20);
            const vol20MA = last20Vol.reduce((a, b) => a + b, 0) / 20;

            let statusSignal = "NEUTRAL ⚖️";
            if (hargaTerkini < ema50) {
                statusSignal = "AVOID 🚫";
            } else {
                const isBBBreakout = hargaTerkini > bb.upper;
                const isTurtleBreakout = hargaTerkini >= high20 || ((high20 - hargaTerkini) / hargaTerkini < 0.01); 
                const isVolBreakout = volTerkini > (vol20MA * 1.5); 

                if (isBBBreakout && isTurtleBreakout && isVolBreakout) {
                    statusSignal = "STRONG BUY 🚀";
                } 
                else if (ema20 > ema50 && ((high20 - hargaTerkini) / hargaTerkini < 0.05) && volTerkini < vol20MA) {
                    statusSignal = "MONITOR CLOSELY 🔭";
                } 
                else if (hargaTerkini > ema50 && (Math.abs(hargaTerkini - ema20)/ema20 < 0.03 || Math.abs(hargaTerkini - ema50)/ema50 < 0.03) && volTerkini < vol20MA) {
                    statusSignal = "PULLBACK 📉";
                }
            }

            // Ambil data 2 tahun (sepenuhnya) untuk dipaparkan di web dashboard
            const senarai2Tahun = senaraiHarga; 
            let dataCartaWeb = [];
            for (let hari of senarai2Tahun) {
                if (hari.close !== null && hari.open !== null) {
                    dataCartaWeb.push({
                        time: hari.date.toISOString().split('T')[0],
                        open: hari.open, high: hari.high, low: hari.low, close: hari.close, volume: hari.volume 
                    });
                }
            }

            let changeRM = 0, changePct = 0, namaSyarikat = item.name || simbol;
            let pe_ratio = null, market_cap = null, eps = null, shares_out = null, book_value = null, div_yield = null;
            let sektorSyarikat = 'N/A';
            let faExtras = { float_shares: null, pb_ratio: null, total_debt: null, net_income: null, roe: null };

            // Penentuan awal perubahan harga
            if(dataClose.length > 1) {
                changeRM = hargaTerkini - dataClose[dataClose.length - 2];
                changePct = (changeRM / dataClose[dataClose.length - 2]) * 100;
            }

            // === MENARIK DATA FA & SEKTOR DARIPADA YAHOO FINANCE ===
            try {
                const quoteData = await yahooFinance.quote(simbol);
                if (quoteData) {
                    changeRM = quoteData.regularMarketChange || changeRM;
                    changePct = quoteData.regularMarketChangePercent || changePct;
                    namaSyarikat = quoteData.shortName || quoteData.longName || item.name;

                    pe_ratio = quoteData.trailingPE || null;
                    market_cap = quoteData.marketCap || null;
                    eps = quoteData.epsTrailingTwelveMonths || null;
                    shares_out = quoteData.sharesOutstanding || null;
                    book_value = quoteData.bookValue || null;
                    div_yield = quoteData.dividendYield || null;
                }
            } catch(e) {
                // Abaikan jika quote gagal, gunakan data lalai
            }

            try {
                const profile = await yahooFinance.quoteSummary(simbol, { 
                    modules: ['assetProfile', 'defaultKeyStatistics', 'financialData'] 
                });

                if (profile) {
                    sektorSyarikat = profile.assetProfile?.sector || 'N/A';
                    let industri = profile.assetProfile?.industry || '';
                    
                    // Semakan Penapis Syariah
                    let textCheck = (sektorSyarikat + " " + industri).toLowerCase();
                    let isHaram = industriHaram.some(keyword => textCheck.includes(keyword));
                    if (isHaram) {
                        console.log(`    -> 🛑 DIKETEPIKAN (Tidak Patuh Syariah: ${industri})`);
                        continue; 
                    }

                    faExtras.float_shares = profile.defaultKeyStatistics?.floatShares || null;
                    faExtras.pb_ratio = profile.defaultKeyStatistics?.priceToBook || null;
                    faExtras.total_debt = profile.financialData?.totalDebt || null;
                    faExtras.net_income = profile.financialData?.netIncomeToCommon || null;
                    faExtras.roe = profile.financialData?.returnOnEquity || null;
                }
            } catch(e) {
                // Abaikan jika profile gagal
            }

            const fa_data_json = {
                shortName: namaSyarikat,
                pe_ratio: pe_ratio, market_cap: market_cap, eps: eps, shares_out: shares_out,
                book_value: book_value, div_yield: div_yield, ema_20: ema20, ema_50: ema50,
                sma_200: sma200, bb_upper: bb.upper, high_20: high20, vol_20ma: vol20MA, ...faExtras 
            };

            const { error } = await supabase.from('hasil_scan').insert([{
                symbol: simbol, name: namaSyarikat, price: hargaTerkini,
                signal: statusSignal, chart_data: dataCartaWeb, sector: sektorSyarikat,
                change: changeRM, change_pct: changePct, volume: volTerkini,
                fa_data: fa_data_json
            }]);

            if (error) {
                console.log(`    -> ⚠️ Gagal simpan: ${error.message}`);
            } else {
                let badge = statusSignal.includes('AVOID') ? '🔴' : '🟢';
                console.log(`    -> ${badge} LULUS | Sector: ${sektorSyarikat} | Signal: ${statusSignal}`);
                jumlahBerjaya++;
            }

        } catch (error) {
            console.log(`    -> ⚠️ Ralat Data: Skip ${simbol}`);
        }
    }
    console.log(`\n✅ SELESAI! ${jumlahBerjaya} saham dianalisis dan disimpan ke Supabase.`);
}

jalankanScannerMomentum();
