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
    
    const senaraiInduk = [];
    const senaraiWaran = [];

    // Tapis dan Asingkan Induk & Waran Syarikat
    masterList.forEach(item => {
        const baseCode = item.symbol.toUpperCase().replace('.KL', '').replace('-', '').trim();
        
        const isMotherShare = /^[A-Z0-9]{3,4}$/.test(baseCode);
        const isCompanyWarrant = /^[A-Z0-9]{3,4}W[A-Z]$/.test(baseCode);

        if (isMotherShare) {
            senaraiInduk.push(item);
        } else if (isCompanyWarrant) {
            senaraiWaran.push(item);
        }
    });

    const senaraiSaham = [...senaraiInduk, ...senaraiWaran];

    console.log("=====================================================");
    console.log(`🚀 ENJIN MOMENTUM PRO (KOD ASAL STABIL)`);
    console.log(`📊 JUMLAH INDUK DIPROSES: ${senaraiInduk.length} Kaunter`);
    console.log(`📊 JUMLAH WARAN DIPROSES: ${senaraiWaran.length} Kaunter`);
    console.log("=====================================================\n");

    const tarikhHariNi = new Date();
    const tarikhLama = new Date();
    tarikhLama.setFullYear(tarikhHariNi.getFullYear() - 2); 

    const queryOptions = {
        period1: tarikhLama.toISOString().split('T')[0], 
        period2: tarikhHariNi.toISOString().split('T')[0], 
        interval: '1d' 
    };

    let jumlahBerjaya = 0;
    const industriHaram = ['bank', 'insurance', 'credit services', 'casino', 'gambling', 'tobacco', 'brewer', 'alcohol', 'liquor'];

    for (let i = 0; i < senaraiSaham.length; i++) {
        let item = senaraiSaham[i];
        let simbol = item.symbol;
        
        console.log(`[${i+1}/${senaraiSaham.length}] Menganalisis ${simbol}...`);
        
        try {
            await rehatSeketika(600); // Elak sekatan Yahoo Finance (Masa asal)

            const dataSejarah = await yahooFinance.chart(simbol, queryOptions);
            const senaraiHarga = dataSejarah?.quotes; 
            
            // JARING KESELAMATAN: Minimum 2 hari data
            if (!senaraiHarga || senaraiHarga.length < 2) {
                console.log(`    -> ⚠️ SKIP: Data kurang 2 hari (${senaraiHarga ? senaraiHarga.length : 0} rekod). Terlalu baru.`);
                continue; 
            }

            let dataHigh = [], dataLow = [], dataClose = [], dataVolume = [];
            senaraiHarga.forEach(hari => {
                if (hari.high && hari.low && hari.close && hari.volume !== undefined) { 
                    dataHigh.push(hari.high); dataLow.push(hari.low); 
                    dataClose.push(hari.close); dataVolume.push(hari.volume);
                }
            });

            // Sekat jika 2 hari terakhir langsung tiada volum
            if(dataVolume[dataVolume.length - 1] === 0 && dataVolume[dataVolume.length - 2] === 0) {
                console.log(`    -> ⚠️ SKIP: Tiada Volume (0 Lot). Kaunter mungkin digantung/kering.`);
                continue;
            }

            const hargaTerkini = dataClose[dataClose.length - 1];
            const volTerkini = dataVolume[dataVolume.length - 1];

            const hasilEMA50 = dataClose.length >= 50 ? EMA.calculate({ period: 50, values: dataClose }) : [];
            const ema50 = hasilEMA50.length > 0 ? hasilEMA50[hasilEMA50.length - 1] : null;

            const hasilEMA20 = dataClose.length >= 20 ? EMA.calculate({ period: 20, values: dataClose }) : [];
            const ema20 = hasilEMA20.length > 0 ? hasilEMA20[hasilEMA20.length - 1] : null;

            const hasilSMA200 = dataClose.length >= 200 ? SMA.calculate({ period: 200, values: dataClose }) : [];
            const sma200 = hasilSMA200.length > 0 ? hasilSMA200[hasilSMA200.length - 1] : null;

            const hasilBB = dataClose.length >= 20 ? BollingerBands.calculate({ period: 20, stdDev: 1, values: dataClose }) : [];
            const bb = hasilBB.length > 0 ? hasilBB[hasilBB.length - 1] : { upper: null, lower: null };

            const jumlahHariVol = Math.min(20, dataVolume.length);
            const last20High = dataHigh.slice(-jumlahHariVol);
            const high20 = Math.max(...last20High);
            
            const last20Vol = dataVolume.slice(-jumlahHariVol);
            const vol20MA = last20Vol.reduce((a, b) => a + b, 0) / jumlahHariVol;

            const baseCodeStr = simbol.toUpperCase().replace('.KL', '').replace('-', '').trim();
            const isWarrant = /^[A-Z0-9]{3,4}W[A-Z]$/.test(baseCodeStr);
            const isIPO = (ema50 === null);

            let statusSignal = "NEUTRAL ⚖️";
            
            if (isIPO) {
                statusSignal = "NEW 🆕";
            } else {
                if (hargaTerkini < ema50) {
                    statusSignal = "AVOID 🚫";
                } else {
                    const isBBBreakout = bb.upper !== null && hargaTerkini > bb.upper;
                    const isTurtleBreakout = hargaTerkini >= high20 || ((high20 - hargaTerkini) / hargaTerkini < 0.01); 
                    const isVolBreakout = volTerkini > (vol20MA * 1.5); 

                    if (isBBBreakout && isTurtleBreakout && isVolBreakout) {
                        statusSignal = "BUY 🚀";
                    } 
                    else if (ema20 !== null && ema20 > ema50 && ((high20 - hargaTerkini) / hargaTerkini < 0.05) && volTerkini < vol20MA) {
                        statusSignal = "MONITOR CLOSELY 🔭";
                    } 
                    else if (hargaTerkini > ema50 && ((ema20 !== null && Math.abs(hargaTerkini - ema20)/ema20 < 0.03) || Math.abs(hargaTerkini - ema50)/ema50 < 0.03) && volTerkini < vol20MA) {
                        statusSignal = "PULLBACK 📉";
                    }
                }
            }

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

            if(dataClose.length > 1) {
                changeRM = hargaTerkini - dataClose[dataClose.length - 2];
                changePct = (changeRM / dataClose[dataClose.length - 2]) * 100;
            }

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
            } catch(e) {}

            try {
                const profile = await yahooFinance.quoteSummary(simbol, { modules: ['assetProfile', 'defaultKeyStatistics', 'financialData'] });
                if (profile) {
                    sektorSyarikat = profile.assetProfile?.sector || 'N/A';
                    let industri = profile.assetProfile?.industry || '';
                    
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
            } catch(e) {}

            // PENGIRAAN RATING 10/10
            let faScore = 0;
            let taScore = 0;

            if (!isWarrant && !isIPO) {
                if (eps !== null && eps > 0) faScore++;
                if (faExtras.roe !== null && faExtras.roe > 0.1) faScore++;
                if (faExtras.net_income !== null && faExtras.net_income > 0) faScore++;
                if (div_yield !== null && div_yield > 0) faScore++;

                if (ema50 !== null && hargaTerkini > ema50) taScore++;
                if (sma200 !== null && hargaTerkini > sma200) taScore++;
                if (ema20 !== null && ema50 !== null && ema20 > ema50) taScore++;
                if (hargaTerkini >= high20) taScore++;
                if (bb.upper !== null && hargaTerkini > bb.upper) taScore++;
                if (volTerkini > (vol20MA * 1.5)) taScore++;
            }

            let total_rating = (isWarrant || isIPO) ? null : (faScore + taScore);

            const fa_data_json = {
                shortName: namaSyarikat, pe_ratio: pe_ratio, market_cap: market_cap, eps: eps, shares_out: shares_out,
                book_value: book_value, div_yield: div_yield, ema_20: ema20, ema_50: ema50,
                sma_200: sma200, bb_upper: bb ? bb.upper : null, high_20: high20, vol_20ma: vol20MA, ...faExtras,
                is_warrant: isWarrant, is_ipo: isIPO, total_rating: total_rating, fa_score: faScore, ta_score: taScore
            };

            // SIMPAN TERUS (UPSERT) SETIAP KAUNTER TANPA TUNGGU BATCH 50
            const { error } = await supabase.from('hasil_scan').upsert([{
                symbol: simbol, name: namaSyarikat, price: hargaTerkini,
                signal: statusSignal, chart_data: dataCartaWeb, sector: sektorSyarikat,
                change: changeRM, change_pct: changePct, volume: volTerkini, fa_data: fa_data_json
            }], { onConflict: 'symbol' });

            if (error) {
                console.log(`    -> ⚠️ Gagal simpan Supabase: ${error.message}`);
            } else {
                let badge = statusSignal.includes('AVOID') ? '🔴' : (statusSignal.includes('NEW') ? '🆕' : '🟢');
                console.log(`    -> ${badge} LULUS & SIMPAN | Sector: ${sektorSyarikat} | Signal: ${statusSignal} | Rating: ${total_rating !== null ? total_rating+'/10' : 'N/A'}`);
                jumlahBerjaya++;
            }

        } catch (error) {
            console.log(`    -> ⚠️ Ralat Panggilan Yahoo: Skip ${simbol}`);
        }
    }
    console.log(`\n✅ SELESAI! ${jumlahBerjaya} saham dianalisis dan disimpan ke Supabase.`);
}

jalankanScannerMomentum();
