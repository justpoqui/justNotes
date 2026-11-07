// Built-in AutoCorrect list: common English typing mistakes → correct word.
// (Your own entries from Settings are checked first.)

export const COMMON_TYPOS: Record<string, string> = {
  teh: 'the', hte: 'the', taht: 'that', thta: 'that', adn: 'and', nad: 'and', wiht: 'with', whith: 'with', fo: 'of',
  ot: 'to', yuo: 'you', yoru: 'your', thier: 'their', theyre: "they're", recieve: 'receive', recieved: 'received',
  beleive: 'believe', belive: 'believe', wierd: 'weird', freind: 'friend', freinds: 'friends', becuase: 'because',
  becasue: 'because', beacuse: 'because', definately: 'definitely', definatly: 'definitely', seperate: 'separate',
  seperately: 'separately', occured: 'occurred', occurence: 'occurrence', untill: 'until', tommorow: 'tomorrow',
  tomorow: 'tomorrow', accomodate: 'accommodate', acheive: 'achieve', adress: 'address', agian: 'again', alot: 'a lot',
  allready: 'already', apparantly: 'apparently', aroudn: 'around', basicly: 'basically', begining: 'beginning',
  calender: 'calendar', comming: 'coming', commited: 'committed', completly: 'completely', concious: 'conscious',
  dissapear: 'disappear', dissapoint: 'disappoint', enviroment: 'environment', existance: 'existence', finaly: 'finally',
  foriegn: 'foreign', fourty: 'forty', goverment: 'government', gaurd: 'guard', happend: 'happened', harrass: 'harass',
  immediatly: 'immediately', independant: 'independent', knowlege: 'knowledge', liason: 'liaison', libary: 'library',
  lisence: 'license', maintainance: 'maintenance', mispell: 'misspell', neccessary: 'necessary', necesary: 'necessary',
  noticable: 'noticeable', occassion: 'occasion', persistant: 'persistent', posession: 'possession', prefered: 'preferred',
  probaly: 'probably', publically: 'publicly', realy: 'really', reccomend: 'recommend', recomend: 'recommend',
  refered: 'referred', relevent: 'relevant', remeber: 'remember', resistence: 'resistance', responsability: 'responsibility',
  rythm: 'rhythm', sieze: 'seize', similiar: 'similar', sincerly: 'sincerely', speach: 'speech', succesful: 'successful',
  successfull: 'successful', supercede: 'supersede', suprise: 'surprise', tatoo: 'tattoo', tendancy: 'tendency',
  truely: 'truly', twelth: 'twelfth', tyrany: 'tyranny', unfortunatly: 'unfortunately', usualy: 'usually',
  vaccuum: 'vacuum', wich: 'which', whcih: 'which', wehn: 'when', waht: 'what', woudl: 'would', wouldnt: "wouldn't",
  shoudl: 'should', shouldnt: "shouldn't", coudl: 'could', couldnt: "couldn't", dont: "don't", doesnt: "doesn't",
  didnt: "didn't", isnt: "isn't", wasnt: "wasn't", arent: "aren't", werent: "weren't", cant: "can't", wont: "won't",
  im: "I'm", ive: "I've", id: "I'd", ill: "I'll", i: 'I', thats: "that's", whats: "what's", theres: "there's",
  lets: "let's", youre: "you're", youve: "you've", hasnt: "hasn't", havent: "haven't", hadnt: "hadn't",
  peopel: 'people', poeple: 'people', jsut: 'just', knwo: 'know', konw: 'know', nwo: 'now', abotu: 'about',
  baout: 'about', thnak: 'thank', thnaks: 'thanks', thansk: 'thanks', becaus: 'because', todya: 'today',
  somthing: 'something', someting: 'something', anythign: 'anything', evrything: 'everything', everyting: 'everything',
  nothign: 'nothing', thign: 'thing', thigns: 'things', alright: 'all right', wnat: 'want', wanna: 'want to',
  gonna: 'going to', mabye: 'maybe', maybee: 'maybe', ahve: 'have', hvae: 'have', mkae: 'make', amke: 'make',
  tiem: 'time', liek: 'like', liekly: 'likely', ntoe: 'note', ntoes: 'notes', pgae: 'page', paeg: 'page'
}

// Contractions above are only applied to these (otherwise "ill", "id", "lets", "cant", "wont", "im"
// are real words or abbreviations too often). They're still offered as spelling suggestions.
export const RISKY_TYPOS = new Set(['ill', 'id', 'lets', 'cant', 'wont', 'wanna', 'gonna', 'alright'])
