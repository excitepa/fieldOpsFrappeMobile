/** UI data boundary: replace these methods with the FieldOps API when its contract is available. */
export const mock = {
  user: { name: 'Amara Okafor', initials: 'AO', territory: 'Lekki Phase 1', rank: 4 },
  campaigns: [
    { id:'1', name:'FreshMart Retail Drive', type:'Sales', progress:68, target:'₦480k / ₦700k', color:'#9C72FF', beat:'Lekki Phase 1' },
    { id:'2', name:'Customer Pulse Survey', type:'Survey', progress:42, target:'84 / 200 responses', color:'#20B8A5', beat:'Victoria Island' },
    { id:'3', name:'New Store Discovery', type:'Lead generation', progress:25, target:'15 / 60 leads', color:'#F2A843', beat:'Lekki Phase 1' },
  ],
  leads: [
    { id:'l1', name:'Mariam Bello', company:'Mariam’s Pantry', phone:'+234 803 555 0192', stage:'Qualified', score:82, next:'Follow up tomorrow', value:'₦180,000' },
    { id:'l2', name:'Chinedu Okeke', company:'Cedar Stores', phone:'+234 806 222 7431', stage:'Prospect', score:64, next:'Call at 2:00 PM', value:'₦95,000' },
    { id:'l3', name:'Ayo Martins', company:'Daily Basket', phone:'+234 809 111 5512', stage:'Prospect', score:45, next:'Visit this week', value:'₦65,000' },
  ],
  products: [
    { id:'p1', name:'FieldFresh 1L', sku:'FF-1L', price:1450, stock:28 },
    { id:'p2', name:'FieldFresh 500ml', sku:'FF-500', price:850, stock:42 },
    { id:'p3', name:'Active Energy 330ml', sku:'AE-330', price:1100, stock:14 },
  ],
  notifications: [
    { id:'n1', title:'New assignment', body:'Customer Pulse Survey has been assigned to you.', time:'10m', color:'#9C72FF' },
    { id:'n2', title:'Low stock alert', body:'Active Energy 330ml is below your stock threshold.', time:'1h', color:'#F2A843' },
    { id:'n3', title:'EOD reminder', body:'Complete stock reconciliation before 6:00 PM.', time:'3h', color:'#20B8A5' },
  ],
  survey: [
    { id:'q1', type:'choice', question:'How satisfied is the customer with product availability?', options:['Very satisfied','Satisfied','Neutral','Dissatisfied'] },
    { id:'q2', type:'rating', question:'Rate the shelf visibility' },
    { id:'q3', type:'text', question:'What would improve the customer experience?' },
    { id:'q4', type:'photo', question:'Capture a shelf photo' },
  ] as const,
};
export const pause = (ms=500) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const demoLogin = async () => { await pause(); return mock.user; };
export const submitMock = async () => { await pause(650); return { queued:false }; };
