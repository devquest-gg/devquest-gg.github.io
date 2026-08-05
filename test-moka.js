const M = require('./scrape.js');
let pass=0, fail=0;
const t=(label,got,want)=>{ if(got===want){pass++;} else {fail++;console.log(`FAIL ${label}: got ${got}, want ${want}`);} };

// 1. Real ciphertext captured live from app.mokahr.com — proves the Node AES path matches their client
const IV="de7c21ed8d6f50fe", KEY="3c371c38006a4d00";
const DATA="+8XYkYFUBIhpcIwSo7NHIAmy4xSEPbnwBHnTtbW4TmBkLwR+0MyHZ4B0nL5w5MEVFFIw0PSaWMbqfwQQkM3XOaswJL9k5yuBt+nMbU+FghNMRP3M27MlUnKV8I1dKbJ0jWRTaFTaSvm6cORBYNLwoP2HEwgXT8Dv+w+Yey4KMPxGKVQVSU4Kv2lITsr5Xxvr0n+C6K7NTlVZgK2bWkL+VlPzihAIFBexNpSFixo3PtXidqnjDyKzkFMm7buP4iyXzUcYuez7NiX0ZfjmeulNRiltybyWyXtCwm2VPf+fUBiwS6kONV2PmlURA5p6h4ZTr9lJCDzm52WoxHXFhRshwSzcY17AKH9+7dSRjyWe6KJAOs+B2w9my3OvX2SJR0f6emFWYIbLr2SXarBz4UbByXJgKineJ14ykWkj/TVGgRQMcB7zD1/Vo9TDZTJG0Wd5KTNqtX0RO6GCdH6vdLKupg1gMhtM1UmwLdEele8TDlRMXZTWCpujvqzfRwMpbPw7Xt1GZQkv1pouzBqvtM3R/JT+39uH5md3tTaIgTdMk9RnU2nbpFqFH2oRHHZ22ctjQXlmXaR0rIjPAMs7gBPGdgq2fN0KaIOxp9KPiKxTbp16suL63+iketaK/kcFSaTyzzp2uip0ZyScxdeUVnJ5nQDO/HmwJr/B/sUpF7TiPT5B8yGxOtHLahrs5htqNbFJmh1Z9hWAMQ+fcGyCJ+dBv2wVPzAmrNGx0u2cGmLp16xGWUmV31ubMNPdZEvylfxU13yU7kFmRzzjRtkDpLA5SCQuMH2XVQQxGbnfSuwPEFwJAYAcTUY/dft8E2s7cz2ERSJxegPvY+hD5mM670P6ezsTQLFcsCNOjcAREkGgTqhIsK6aDy5A/ipJvOh9EfNQcryy2ip7hUNPMNJEJe9eMDoaWXdOPvQaDYZ18W1WDFaZF9rWK/w9wMZo42w0koX2TpYBacOoLMtIOg5YFL/A6/ltci9bNuj3BTH2RVtUFZfKAD1DoYrN3td4IDl8GQO3+PVpQwj6cf5MUUlm6Fx3JT5FOtnO2MQ+DCQzKnPvSw5oMgrxoAe9659RiaEDXaGcDOkzulxR2Vpp7zUQxRiRR/VUzk0vcZNupJ2OAWHKkT/qiU3AEW5ZNaQ8BnObYfnD6AL+mxABEbDmHWlc/CNU4AYpFAkdPGiGQygj5vV8CNV/6cEICYUQ6tjfQr4Tpe4WmAEoZj63lVvmKq8OKqtSmLme5FQH/umwBX1glWHIcvMTj0JrI4FPkFPpCYfdsYKMWmXcnfjfKcwnIUFDUnYP9MnA1upNY2CPpi09kizAbexpLCS+fvuWh36ik1DKnE0Mu159gOYj93NMRSJSubm3xlAiydhPvRoUVSQ0bI0jRNU/v2JjJvG4YR6qp+1nmhh7";
const o = JSON.parse(M.mokaDecrypt(DATA, KEY, IV));
t('decrypt.success', o.success, true);
t('decrypt.total', o.data.jobStats.total, 165);
t('decrypt.jobs', o.data.jobs.length, 2);
t('decrypt.title', o.data.jobs[0].title, '资深客户端开发/主程');

// 2. Discipline mapping against REAL titles pulled off the three app.mokahr.com boards
const cases = [
  ['资深客户端开发/主程','Engineering'], ['游戏服务器开发（Golang）','Engineering'], ['c++服务器开发工程师','Engineering'],
  ['godot客户端开发工程师','Engineering'], ['iOS开发工程师（游戏SDK方向）','Engineering'], ['数据开发','Data & Analytics'],
  ['系统策划','Design'], ['游戏数值策划','Design'], ['战斗策划（卡牌）','Design'], ['文案策划','Design'],
  ['资深关卡策划','Design'], ['战斗/角色策划','Design'], ['AI短剧编剧','Design'],
  ['AI原画师','Art'], ['角色原画师（国风）','Art'], ['资深3D地编师（二次元）','Art'], ['GUI设计师','Art'],
  ['资深技术美术（技术方向）','Art'], ['3D特效（二次元）','Art'], ['平面设计师','Art'], ['IP插画师','Art'],
  ['2D动作','Animation'], ['角色动画师','Animation'], ['UI动效设计师','Animation'], ['界面动效','Animation'],
  ['配乐师','Audio'], ['音乐设计','Audio'],
  ['游戏测试工程师','QA'], ['游戏主QA（上海）','QA'], ['测试开发工程师','QA'],
  ['游戏战略用户研究','Data & Analytics'], ['数据运营','Data & Analytics'],
  ['海外社媒运营','Marketing'], ['广告投放','Marketing'], ['资深电商运营（兴趣电商/货架电商）','Marketing'],
  ['赛事运营（直播制作方向）','Marketing'], ['IP整合营销','Marketing'], ['拆卡主播','Marketing'],
  ['制作人','Production'], ['项目管理','Production'], ['AI漫剧导演','Production'], ['活动运营','Production'],
  ['资深HRBP','People & Ops'],
  ['资深法务','Business & Ops'], ['财务核算','Business & Ops'], ['资深内审','Business & Ops'], ['采购开发','Engineering'],
  // English titles must fall through to the existing mapper
  ['Rendering Programmer (UE4)','Engineering'], ['Senior Character Concept Artist','Art'],
  ['Senior Animator','Animation'], ['Level Designer (Open World)','Design'], ['Community Manager','Marketing'],
  ['Senior VFX Artist','Art'], ['Game Writer','Design'], ['Data Architect (JAVA)','Engineering'],   // mapDiscipline's existing call; left as-is rather than bending shared behaviour
];
for (const [title, want] of cases) t('disc:'+title, M.mokaDiscipline(title,''), want);

// 3. Seniority
t('sen.intern', M.mokaSeniority('角色原画实习生','实习'), 'Entry');
t('sen.commitment', M.mokaSeniority('翻译审校','实习'), 'Entry');
t('sen.lead', M.mokaSeniority('U3D客户端主程','全职'), 'Lead');
t('sen.leadgroup', M.mokaSeniority('战斗策划组长','全职'), 'Lead');
t('sen.senior', M.mokaSeniority('资深场景原画','全职'), 'Senior');
t('sen.en', M.mokaSeniority('Senior 3D Artist','全职'), 'Senior');

// 4. Locations — Chinese must become English, never leak raw CJK
const st={name:'X',city:'Shanghai, China'};
t('loc.cn', M.mokaLocation({locations:[{cityName:'武侯区',provinceName:'四川',country:'中国'}]},st), 'Sichuan, China');
t('loc.municipality', M.mokaLocation({locations:[{cityName:'徐汇区',provinceName:'上海市',country:'中国'}]},st), 'Shanghai, China');
t('loc.hk', M.mokaLocation({locations:[{cityName:'南区',provinceName:'香港',country:'中国'}]},st), 'Hong Kong, China');
t('loc.us', M.mokaLocation({locations:[{cityName:'波士顿',provinceName:'马萨诸塞州',country:'美国'}]},st), 'Boston, Massachusetts, United States');
t('loc.ascii', M.mokaLocation({locations:[{cityName:'Tokyo',provinceName:'',country:'日本'}]},st), 'Tokyo, Japan');
t('loc.none', M.mokaLocation({locations:[]},st), 'Shanghai, China');
const unmapped = M.mokaLocation({locations:[{cityName:'某某区',provinceName:'某某省',country:'中国'}]},st);
t('loc.unmapped-no-cjk', /[一-鿿]/.test(unmapped), false);
t('loc.unmapped-value', unmapped, 'China');

// 5. Region must resolve (the whole point of the place map)
const { mapDiscipline } = M;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
