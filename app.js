(function(){
  const { useState, useEffect, useMemo } = React;

  const fmtInt = (n)=> new Intl.NumberFormat('ru-RU').format(Math.round(n||0));
  const fmtRub = (n)=> new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(Math.round(n||0));
  const clamp = (v,min,max)=> Math.min(max, Math.max(min, isFinite(v)?v:0));

  const DEFAULTS = {
    apts: 500, pplPerApt: 3, lpdPerPerson: 180,
    occupancy: 0.95, kh: 2.2, ks: 1.15, nfModuleM3h: 1, nPlus1: true,
    prices: { nf:185450, uf:557977, uv:76800, pump:283929, carbon:117720, mineral:80000, tank5m3:120000, inoxPerM:1105, pexPerM:399, plc:250000, install:850000, roomPerM2:8000, design:400000 },
    defs: { tanks:2, inoxM:400, pexM:1600, roomM2:40 },
    opex: { loadFactor:0.35, inflation:3, energyRurPerM3:0.6, reagentsRurPerM3:0.4, nfMembranePrice:20000, nfMembraneFrac:1/3, serviceY1:120000 }
  };

  function useSticky(key, initial){
    const [value, setValue] = useState(()=>{ try{const raw=localStorage.getItem(key); return raw?JSON.parse(raw):initial;}catch{return initial;} });
    useEffect(()=>{ try{localStorage.setItem(key, JSON.stringify(value));}catch{} }, [key, value]);
    return [value, setValue];
  }

  function NumberInput({label, value, onChange, step=1, min=0, max=1e9}){
    return (
      React.createElement('label', {className:'row'},
        React.createElement('span', null, label),
        React.createElement('input', {
          className:'input', type:'number', step, value: Number.isFinite(value)?value:0,
          onChange: e=> onChange(clamp(parseFloat(e.target.value||'0'), min, max))
        })
      )
    );
  }

  function App(){
    const [apts, setApts] = useSticky('apts', DEFAULTS.apts);
    const [pplPerApt, setPplPerApt] = useSticky('pplPerApt', DEFAULTS.pplPerApt);
    const [lpdPerPerson, setLpdPerPerson] = useSticky('lpd', DEFAULTS.lpdPerPerson);

    const [occupancy, setOccupancy] = useSticky('occ', DEFAULTS.occupancy);
    const [kh, setKh] = useSticky('kh', DEFAULTS.kh);
    const [ks, setKs] = useSticky('ks', DEFAULTS.ks);
    const [nfModuleM3h, setNfModuleM3h] = useSticky('nfmod', DEFAULTS.nfModuleM3h);
    const [nPlus1, setNPlus1] = useSticky('nplus1', DEFAULTS.nPlus1);

    const [prices, setPrices] = useSticky('prices', DEFAULTS.prices);
    const [defs, setDefs] = useSticky('defs', DEFAULTS.defs);
    const [opx, setOpx] = useSticky('opex', DEFAULTS.opex);

    const calc = useMemo(()=>{
      const population = apts * pplPerApt * occupancy;
      const m3PerDay = population * lpdPerPerson / 1000;
      const m3PerHourAvg = m3PerDay / 24;
      const m3PerHourPeak = m3PerHourAvg * kh;
      const requiredM3h = m3PerHourPeak * ks;
      const lPerHour = requiredM3h * 1000;

      const ceil = (x)=> Math.ceil(x);
      const nfCount = ceil(requiredM3h / nfModuleM3h);
      const ufUnitCap = 10, uvUnitCap = 10, pumpUnitCap = 10, carbonUnitCap = 2;
      const ufCount = ceil(requiredM3h / ufUnitCap);
      const uvCountRaw = ceil(requiredM3h / uvUnitCap);
      const pumpCountRaw = ceil(requiredM3h / pumpUnitCap);
      const uvCount = nPlus1 ? Math.max(2, uvCountRaw) : uvCountRaw;
      const pumpCount = nPlus1 ? Math.max(2, pumpCountRaw) : pumpCountRaw;
      const carbonCount = ceil(requiredM3h / carbonUnitCap);

      const capex =
        prices.nf * nfCount +
        prices.uf * ufCount +
        prices.uv * uvCount +
        prices.pump * pumpCount +
        prices.carbon * carbonCount +
        prices.mineral * 1 +
        prices.tank5m3 * defs.tanks +
        prices.inoxPerM * defs.inoxM +
        prices.pexPerM * defs.pexM +
        prices.plc * 1 +
        prices.install * 1 +
        prices.roomPerM2 * defs.roomM2 +
        prices.design * 1;

      const annualM3 = requiredM3h * 24 * 365 * opx.loadFactor;
      const y1E = opx.energyRurPerM3 * annualM3;
      const y1R = opx.reagentsRurPerM3 * annualM3;
      const y1M = opx.nfMembranePrice * nfCount * opx.nfMembraneFrac;
      const y1S = opx.serviceY1;
      const infl = (y1,n)=> y1 * Math.pow(1+opx.inflation/100, n);
      const years = [
        y1E + y1R + y1M + y1S,
        infl(y1E,1)+infl(y1R,1)+infl(y1M,1)+infl(y1S,1),
        infl(y1E,2)+infl(y1R,2)+infl(y1M,2)+infl(y1S,2),
        infl(y1E,3)+infl(y1R,3)+infl(y1M,3)+infl(y1S,3),
        infl(y1E,4)+infl(y1R,4)+infl(y1M,4)+infl(y1S,4),
      ];
      const opex5y = years.reduce((a,b)=>a+b,0);

      return { population, m3PerDay, m3PerHourAvg, m3PerHourPeak, requiredM3h, lPerHour,
        nfCount, ufCount, uvCount, pumpCount, carbonCount, capex, years, opex5y };
    }, [apts,pplPerApt,lpdPerPerson,occupancy,kh,ks,nfModuleM3h,nPlus1,prices,defs,opx]);

    return React.createElement('div', {className:'container'},
      React.createElement('header', {className:'section'},
        React.createElement('div', {className:'h1'}, 'Калькулятор водоочистки'),
        React.createElement('div', {className:'badge'}, 'мобайл‑friendly, офлайн, можно добавить на экран')
      ),
      React.createElement('section', {className:'card section'},
        React.createElement('div', {className:'h2'}, 'Быстрый расчёт (3 параметра)'),
        React.createElement(NumberInput, {label:'Квартиры, шт', value:apts, onChange:setApts, step:1, min:1}),
        React.createElement(NumberInput, {label:'Людей на квартиру, чел', value:pplPerApt, onChange:setPplPerApt, step:0.1, min:0.1, max:10}),
        React.createElement(NumberInput, {label:'Потребление на человека, л/сут', value:lpdPerPerson, onChange:setLpdPerPerson, step:1, min:1, max:1000}),
        React.createElement('div', {className:'badge'}, 'Остальные параметры – в «Расширенных».')
      ),
      React.createElement('section', {className:'card section'},
        React.createElement('div', {className:'h2'}, 'Результаты'),
        React.createElement('div', {className:'grid'},
          React.createElement('div', {className:'tile'},
            React.createElement('div', {className:'label'}, 'Население, чел'),
            React.createElement('div', {className:'value'}, fmtInt(calc.population))
          ),
          React.createElement('div', {className:'tile'},
            React.createElement('div', {className:'label'}, 'Требуемая мощность, м³/ч'),
            React.createElement('div', {className:'value'}, calc.requiredM3h.toFixed(2))
          ),
          React.createElement('div', {className:'tile span'},
            React.createElement('div', {className:'label'}, 'Требуемая мощность, л/ч'),
            React.createElement('div', {className:'value'}, fmtInt(calc.lPerHour))
          )
        )
      ),
      React.createElement('section', {className:'card section'},
        React.createElement('div', {className:'h2'}, 'Подбор оборудования (шт)'),
        React.createElement('div', {className:'grid'},
          React.createElement('div', {className:'tile'},
            React.createElement('div', {className:'label'}, 'NF‑модули'),
            React.createElement('div', {className:'value'}, fmtInt(calc.nfCount))
          ),
          React.createElement('div', {className:'tile'},
            React.createElement('div', {className:'label'}, 'UF‑блоки'),
            React.createElement('div', {className:'value'}, fmtInt(calc.ufCount))
          ),
          React.createElement('div', {className:'tile'},
            React.createElement('div', {className:'label'}, 'УФ‑установки'),
            React.createElement('div', {className:'value'}, fmtInt(calc.uvCount))
          ),
          React.createElement('div', {className:'tile'},
            React.createElement('div', {className:'label'}, 'Насосы'),
            React.createElement('div', {className:'value'}, fmtInt(calc.pumpCount))
          ),
          React.createElement('div', {className:'tile span'},
            React.createElement('div', {className:'label'}, 'Колонны с актив. углём'),
            React.createElement('div', {className:'value'}, fmtInt(calc.carbonCount))
          )
        )
      ),
      React.createElement('section', {className:'card section'},
        React.createElement('div', {className:'h2'}, 'Стоимость'),
        React.createElement('div', {className:'grid'},
          React.createElement('div', {className:'tile'},
            React.createElement('div', {className:'label'}, 'CAPEX, ₽'),
            React.createElement('div', {className:'value'}, fmtRub(calc.capex))
          ),
          React.createElement('div', {className:'tile'},
            React.createElement('div', {className:'label'}, 'OPEX 5 лет, ₽'),
            React.createElement('div', {className:'value'}, fmtRub(calc.opex5y))
          ),
          React.createElement('div', {className:'tile span'},
            React.createElement('div', {className:'label'}, 'TCO 5 лет, ₽'),
            React.createElement('div', {className:'value'}, fmtRub(calc.capex + calc.opex5y))
          )
        )
      ),
      React.createElement('details', {className:'section'},
        React.createElement('summary', null, 'Расширенные настройки'),
        React.createElement('div', {className:'card', style:{marginTop:8}},
          React.createElement(NumberInput, {label:'Коэффициент заселения', value:occupancy, onChange:setOccupancy, step:0.01, min:0.1, max:1}),
          React.createElement(NumberInput, {label:'Пиковый коэф. часа (Kh)', value:kh, onChange:setKh, step:0.1, min:1, max:5}),
          React.createElement(NumberInput, {label:'Страховой коэф. (Ks)', value:ks, onChange:setKs, step:0.01, min:1, max:2}),
          React.createElement(NumberInput, {label:'Тип НФ‑модуля, м³/ч', value:nfModuleM3h, onChange:setNfModuleM3h, step:1, min:1, max:10}),
          React.createElement('label', {className:'row switch'},
            React.createElement('span', null, 'Резервирование N+1'),
            React.createElement('input', {type:'checkbox', checked:nPlus1, onChange:e=>setNPlus1(e.target.checked)})
          ),
          React.createElement('hr', null),
          React.createElement('div', {className:'h2'}, 'Цены и доп. параметры'),
          ...Object.entries(prices).map(([k,v]) =>
            React.createElement('label', {key:k, className:'row'},
              React.createElement('span', null, k),
              React.createElement('input', {className:'input', type:'number', value:v, onChange:e=>setPrices({...prices, [k]: parseFloat(e.target.value||'0') })})
            )
          ),
          React.createElement(NumberInput, {label:'Ёмкости, шт', value:defs.tanks, onChange:n=>setDefs({...defs, tanks:n}), step:1}),
          React.createElement(NumberInput, {label:'Нерж. труба, м', value:defs.inoxM, onChange:n=>setDefs({...defs, inoxM:n}), step:1}),
          React.createElement(NumberInput, {label:'PEX‑a труба, м', value:defs.pexM, onChange:n=>setDefs({...defs, pexM:n}), step:1}),
          React.createElement(NumberInput, {label:'Площадь помещения, м²', value:defs.roomM2, onChange:n=>setDefs({...defs, roomM2:n}), step:1}),
          React.createElement('hr', null),
          React.createElement(NumberInput, {label:'Коэф. загрузки', value:opx.loadFactor, onChange:n=>setOpx({...opx, loadFactor:n}), step:0.01, min:0, max:1}),
          React.createElement(NumberInput, {label:'Инфляция, %/год', value:opx.inflation, onChange:n=>setOpx({...opx, inflation:n}), step:0.1, min:0}),
          React.createElement(NumberInput, {label:'Энергия, ₽/м³', value:opx.energyRurPerM3, onChange:n=>setOpx({...opx, energyRurPerM3:n}), step:0.01, min:0}),
          React.createElement(NumberInput, {label:'Реагенты/СИП, ₽/м³', value:opx.reagentsRurPerM3, onChange:n=>setOpx({...opx, reagentsRurPerM3:n}), step:0.01, min:0}),
          React.createElement(NumberInput, {label:'Цена мембраны NF, ₽/шт', value:opx.nfMembranePrice, onChange:n=>setOpx({...opx, nfMembranePrice:n}), step:100, min:0}),
          React.createElement(NumberInput, {label:'Доля замены мембран/год', value:opx.nfMembraneFrac, onChange:n=>setOpx({...opx, nfMembraneFrac:n}), step:0.05, min:0, max:1}),
          React.createElement(NumberInput, {label:'Сервис (фикс.) 1-й год, ₽', value:opx.serviceY1, onChange:n=>setOpx({...opx, serviceY1:n}), step:1000, min:0})
        )
      ),
      React.createElement('div', {className:'footer'}, 'v1 • GitHub Pages/PWA')
    );
  }

  ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(App));
})();