import fs from 'fs';
import YahooFinance from 'yahoo-finance2';
import { EMA, SMA, BollingerBands } from 'technicalindicators'; 
import { createClient } from '@supabase/supabase-js';

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
    const senaraiInduk = []; const senaraiWaran = [];

    masterList.forEach(item => {
        const baseCode = item.symbol.toUpperCase().replace('.KL', '').replace('-', '').trim();
        const isMotherShare = /^[A-Z0-9]{3,4}$/.test(baseCode);
        const isCompanyWarrant = /^[A-Z0-9]{3,4}W[A-Z]$/.test(baseCode);
        item.isWarrant = isCompanyWarrant;

        if (isMotherShare) senaraiInduk.push(item);
        else if (isCompanyWarrant) senaraiWaran.push(item);
    });

    const senaraiSaham = [...senaraiInduk, ...senaraiWaran];

    console.log("=====================================================");
    console.log(`🚀 ENJIN MOMENTUM PRO (RATING 10/10 SYSTEM)`);
    console.log(`📊 JUMLAH INDUK DIPROSES: ${senaraiInduk.length} Kaunter`);
    console.log(`📊 JUMLAH WARAN DIPROSES: ${senaraiWaran.length} Kaunter`);
    console.log("=====================================================\n");

    const tarikhHariNi = new Date(); const tarikhLama = new Date();
    tarikhLama.setFullYear(tarikhHariNi.getFullYear() - 2); 
    const queryOptions = { period1: tarikhLama.toISOString().split('T')[0], period2: tarikhHariNi.toISOString().split('T')[0], interval: '1d' };

    console.log("🧹 Memadamkan rekod lama di Supabase...");
    await supabase.from('hasil_scan').delete().neq('id', 0);

    let jumlahBerjaya = 0;
    const industriHaram = ['bank', 'insurance', 'credit services', 'casino', 'gambling', 'tobacco', 'brewer', 'alcohol', 'liquor'];

    for (let i = 0; i < senaraiSaham.length; i++) {
        let item = senaraiSaham[i]; let simbol = item.symbol;
        console.log(`[${i+1}/${senaraiSaham.length}] Menganalisis ${simbol}...`);
        
        try {
            await rehatSeketika(600);
            const dataSejarah = await yahooFinance.chart(simbol, queryOptions);
            const senaraiHarga = dataSejarah?.quotes; 
            
            if (!senaraiHarga || senaraiHarga.length < 2) {
                console.log(`    -> ⚠️ SKIP: Data kurang 2 hari.`);
                continue; 
            }

            let dataHigh = [], dataLow = [], dataClose = [], dataVolume = [];
            senaraiHarga.forEach(hari => {
                if (hari.high && hari.low && hari.close && hari.volume !== undefined) { 
                    dataHigh.push(hari.high); dataLow.push(hari.low); dataClose.push(hari.close); dataVolume.push(hari.volume);
                }
            });

            if(dataVolume[dataVolume.length - 1] === 0 && dataVolume[dataVolume.length - 2] === 0) {
                console.log(`    -> ⚠️ SKIP: Tiada Volume (0 Lot).`); continue;
            }

            const hargaTerkini = dataClose[dataClose.length - 1];
            const volTerkini = dataVolume[dataVolume.length - 1];

            const hasilEMA50 = dataClose.length >= 50 ? EMA.calculate({ period: 50, values: dataClose }) : [];
            const ema50 = hasilEMA50.length > 0 ? hasilEMA50[hasilEMA50.length - 1] : null;

            const hasilEMA20 = dataClose.length >= 20 ? EMA.calculate({ period: 20, values: dataClose }) : [];
            const ema20 = hasilEMA20.length > 0 ? hasilEMA20[hasilEMA20.length - 1] : null;

            const hasilSMA200 = dataClose.length >= 200 ? SMA.calculate({ period: 200, values: dataClose }) : [];
            const sma200 = hasilSMA200.length > 0 ? hasilSMA200[hasilSMA200.length - 1] : null;

            // Bollinger Bands FRED TAM (20, 1)
            const hasilBB = dataClose.length >= 20 ? BollingerBands.calculate({ period: 20, stdDev: 1, values: dataClose }) : [];
            const bb = hasilBB.length > 0 ? hasilBB[hasilBB.length - 1] : { upper: null, lower: null };

            const jumlahHariVol = Math.min(20, dataVolume.length);
            const last20High = dataHigh.slice(-jumlahHariVol);
            const high20 = Math.max(...last20High);
            const vol20MA = dataVolume.slice(-jumlahHariVol).reduce((a, b) => a + b, 0) / jumlahHariVol;

            // 52-Week High (Kira-kira 250 hari berdagang)
            const jumlahHari52W = Math.min(250, dataHigh.length);
            const high52Week = Math.max(...dataHigh.slice(-jumlahHari52W));

            let statusSignal = "NEUTRAL ⚖️";
            if (ema50 === null) statusSignal = "NEW 🆕";
            else if (hargaTerkini < ema50) statusSignal = "AVOID 🚫";
            else {
                const isBBBreakout = bb.upper !== null && hargaTerkini > bb.upper;
                const isTurtleBreakout = hargaTerkini >= high20 || ((high20 - hargaTerkini) / hargaTerkini < 0.01); 
                const isVolBreakout = volTerkini > (vol20MA * 1.5); 

                if (isBBBreakout && isTurtleBreakout && isVolBreakout) statusSignal = "STRONG BUY 🚀";
                else if (ema20 !== null && ema20 > ema50 && ((high20 - hargaTerkini) / hargaTerkini < 0.05) && volTerkini < vol20MA) statusSignal = "MONITOR CLOSELY 🔭";
                else if (hargaTerkini > ema50 && ((ema20 !== null && Math.abs(hargaTerkini - ema20)/ema20 < 0.03) || Math.abs(hargaTerkini - ema50)/ema50 < 0.03) && volTerkini < vol20MA) statusSignal = "PULLBACK 📉";
            }

            const senarai2Tahun = senaraiHarga; let dataCartaWeb = [];
            for (let hari of senarai2Tahun) {
                if (hari.close !== null && hari.open !== null) dataCartaWeb.push({ time: hari.date.toISOString().split('T')[0], open: hari.open, high: hari.high, low: hari.low, close: hari.close, volume: hari.volume });
            }

            let changeRM = 0, changePct = 0, namaSyarikat = item.name || simbol, pe_ratio = null, market_cap = null, eps = null, shares_out = null, book_value = null, div_yield = null;
            let sektorSyarikat = 'N/A'; let faExtras = { float_shares: null, pb_ratio: null, total_debt: null, net_income: null, roe: null };

            if(dataClose.length > 1) { changeRM = hargaTerkini - dataClose[dataClose.length - 2]; changePct = (changeRM / dataClose[dataClose.length - 2]) * 100; }

            try {
                const quoteData = await yahooFinance.quote(simbol);
                if (quoteData) { changeRM = quoteData.regularMarketChange || changeRM; changePct = quoteData.regularMarketChangePercent || changePct; namaSyarikat = quoteData.shortName || quoteData.longName || item.name; pe_ratio = quoteData.trailingPE || null; market_cap = quoteData.marketCap || null; eps = quoteData.epsTrailingTwelveMonths || null; shares_out = quoteData.sharesOutstanding || null; book_value = quoteData.bookValue || null; div_yield = quoteData.dividendYield || null; }
            } catch(e) {}

            try {
                const profile = await yahooFinance.quoteSummary(simbol, { modules: ['assetProfile', 'defaultKeyStatistics', 'financialData'] });
                if (profile) {
                    sektorSyarikat = profile.assetProfile?.sector || 'N/A';
                    let industri = profile.assetProfile?.industry || '';
                    let isHaram = industriHaram.some(keyword => (sektorSyarikat + " " + industri).toLowerCase().includes(keyword));
                    if (isHaram) { console.log(`    -> 🛑 SKIP (Tidak Patuh Syariah)`); continue; }
                    faExtras.float_shares = profile.defaultKeyStatistics?.floatShares || null; faExtras.pb_ratio = profile.defaultKeyStatistics?.priceToBook || null; faExtras.total_debt = profile.financialData?.totalDebt || null; faExtras.net_income = profile.financialData?.netIncomeToCommon || null; faExtras.roe = profile.financialData?.returnOnEquity || null;
                }
            } catch(e) {}

            // === PENGIRAAN RATING 10 MARKAH ===
            let faScore = 0, taScore = 0;
            const isIPO = dataClose.length < 150 && !item.isWarrant;

            // 4 Markah FA
            if (eps > 0) faScore++;
            if (faExtras.roe > 0.10) faScore++;
            if (faExtras.float_shares && faExtras.float_shares < 1000000000) faScore++; // Saham ringan bawah 1B
            if (faExtras.net_income > 0 || div_yield > 0) faScore++;

            // 6 Markah TA
            if (ema50 !== null && sma200 !== null && ema50 > sma200) taScore++;
            if (ema20 !== null && ema50 !== null && hargaTerkini > ema20 && hargaTerkini > ema50) taScore++;
            if (high52Week > 0 && ((high52Week - hargaTerkini) / high52Week) <= 0.15) taScore++; // Dekat 52W High
            if (volTerkini > (vol20MA * 1.5)) taScore++;
            if (hargaTerkini >= high20 || ((high20 - hargaTerkini) / hargaTerkini < 0.01)) taScore++;
            if (bb.upper !== null && hargaTerkini > bb.upper) taScore++;

            const totalRating = faScore + taScore;

            const fa_data_json = {
                shortName: namaSyarikat, pe_ratio: pe_ratio, market_cap: market_cap, eps: eps, shares_out: shares_out,
                book_value: book_value, div_yield: div_yield, ema_20: ema20, ema_50: ema50,
                sma_200: sma200, bb_upper: bb ? bb.upper : null, high_20: high20, vol_20ma: vol20MA, 
                high_52w: high52Week, fa_score: faScore, ta_score: taScore, total_rating: totalRating,
                is_warrant: item.isWarrant, is_ipo: isIPO, ...faExtras 
            };

            const { error } = await supabase.from('hasil_scan').insert([{
                symbol: simbol, name: namaSyarikat, price: hargaTerkini, signal: statusSignal, chart_data: dataCartaWeb, 
                sector: sektorSyarikat, change: changeRM, change_pct: changePct, volume: volTerkini, fa_data: fa_data_json
            }]);

            if (error) console.log(`    -> ⚠️ Gagal simpan DB: ${error.message}`);
            else { console.log(`    -> ✅ LULUS | Rating: ${item.isWarrant || isIPO ? 'N/A' : totalRating+'/10'} | Signal: ${statusSignal}`); jumlahBerjaya++; }

        } catch (error) { console.log(`    -> ⚠️ Ralat Panggilan Yahoo: Skip ${simbol}`); }
    }
    console.log(`\n✅ SELESAI! ${jumlahBerjaya} saham disimpan.`);
}
jalankanScannerMomentum();
