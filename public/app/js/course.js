// Course content: days, lessons, quizzes, and the order players move through them.
import { S } from './state.js';
import { V } from './visuals.js';

// Node kinds: lesson (book icon) and review (crown). Steps: text | odds | q (question with one right answer).
// Day = 2-3 lessons + a 10-question quiz (pass 8/10). A lesson = 8-15 short slides (20-40 words, plain words) + 2-3 questions with hints.
// Every slide has an illustration (v). Options are shuffled on screen, so the right answer is written first (a: 0).
const T = (big, body, v) => ({ t: 'text', big, body, v });
const q = (ask, opts, why, hint) => ({ t: 'q', ask, opts, a: 0, why, hint });
const C = '¢';
export const COURSE = [
  { day: 1, title: 'How it works, and why it isn’t gambling', nodes: [
    { id: 'd1l1', kind: 'lesson', title: 'A price is a probability', steps: [
      T('Welcome! Let’s start simple.', 'A prediction market asks one yes-or-no question about the future. For example: will the Fed cut interest rates in December?', V.q('Will the Fed cut rates', 'in December?')),
      T('Pick a side: YES or NO.', 'Think it’ll happen? Buy YES. Think it won’t? Buy NO. That’s the whole idea. Each piece you buy is called a contract.', V.split('YES', 'NO')),
      { t: 'odds', big: 'Every contract has a price.', crowd: 62, body: `In the Simulator you see it right on the button: YES 62${C}. Prices go from 1${C} to 99${C}. Let’s see what that number means.` },
      T('The price is like a vote count.', `62${C} means the crowd thinks there’s about a 62% chance. Just read cents as percent. Easy, right?`, V.dots(50, 31, '62% of the crowd says YES')),
      T('Cheap means unlikely. Pricey means likely.', `10${C}? The crowd thinks it’s a long shot. 90${C}? Almost sure. But almost sure is still not certain.`, V.bars([{ l: 'long shot', v: 10, top: `10${C}`, c: 'var(--miss)' }, { l: 'coin flip', v: 50, top: `50${C}`, c: 'var(--gold)' }, { l: 'likely', v: 90, top: `90${C}`, c: 'var(--hit)' }])),
      T('News moves the price.', 'Simulator prices are live. A surprise inflation number or a Fed speech can push them up or down in minutes, as people change their minds.', V.chart('up', 'CPI news')),
      T('The crowd isn’t always right.', 'Something priced at 62% still fails about 4 times out of 10. Your job is to spot when the crowd is too high or too low.', V.dots(10, 6, 'priced at 62%: about 6 hit, 4 miss', true)),
      T('Practice in the Simulator.', 'The Simulator shows real live markets at real prices, but you trade demo money. Make mistakes for free and build your own track record.', V.emoji('🎮', ['🪙', 'LIVE', 'DEMO'])),
      T('Your demo trades show up in one place.', 'Cash, trades and P&L sit at the top of the Simulator. Tap any contract to see how it’s doing.', V.wallet([['Cash', '$938'], ['Trades', '1'], ['P&L', '+$4', 'hit']])),
      q(`In the Simulator, the YES button on “Will the Fed cut rates?” says 30${C}. What chance does the market give?`, ['About 30%', 'About 70%', `It pays 30${C}`], 'Read cents as percent: 30¢ ≈ 30%.', 'Read the price on the button as a percent.'),
      q(`You open a Simulator market and YES costs 85${C}. What does the crowd think?`, ['Likely, but not certain', 'It will surely happen', 'It’s unlikely'], '85% is high, but only 100% would be certain.', 'How far is 85 from 100?')
    ], cta: { label: 'Try a demo trade', text: 'Now try it on a live market with demo money: pick one and buy YES or NO.', href: '#/sim' } },
    { id: 'd1l2', kind: 'lesson', title: '$1 or $0: your max loss is fixed', steps: [
      T('Every market has an end date.', 'On that day we get a clear answer. Did the Fed cut rates or not? It’s yes or no, nothing in between.', V.emoji('🗓️', ['✅', 'DEC 10'])),
      T('Right answer? You get $1.', 'Each winning contract pays exactly $1. Held YES and it happened? $1 each. Held NO and it didn’t happen? Also $1 each.', V.coin('YES ✓', '$1', 'winners always get $1')),
      T('Wrong answer? You get $0.', 'Losing contracts pay nothing. That’s the worst case. No debt, no surprise bills. A contract can’t drop below zero.', V.coin('NO ✕', '$0', 'no debt, no bills', true)),
      T('What you pay is the most you can lose.', `Buy 10 YES at 62${C} and you pay $6.20. If you’re wrong, you lose $6.20. Not a cent more.`, V.ticket([[`10 YES × 62${C}`, '$6.20'], ['Max loss', '$6.20']])),
      T('Your best case is fixed too.', 'Those 10 contracts pay $10 at most. You paid $6.20, so the most you can make is $3.80.', V.stack([{ l: 'you paid $6.20', v: 62 }, { l: 'gain $3.80', v: 38, c: 'var(--hit)' }], '$10')),
      T('Cheap contracts: big payout, rare win.', `A 10${C} contract pays $1 if it wins. That’s ten times your money. But the crowd says it happens about 1 time in 10.`, V.coin(`10${C}`, '$1', 'happens about 1 time in 10')),
      T('Pricey contracts: small payout, often.', `A 90${C} contract earns just 10${C} when it wins. One loss costs 90${C} and wipes out nine wins.`, V.winloss()),
      T('Check two numbers before every trade.', 'Max loss and max payout. Oddlin shows both on every ticket. Look at them before you tap Buy. Every single time.', V.ticket([['Max loss', '$6.20'], ['Max payout', '$10.00']])),
      T('Pick your comfort zone first.', 'Before a trade, decide how much you’re okay losing on that idea. Then buy only as many contracts as fit that amount.', V.slider('$0', '$20', 'okay to lose: $10')),
      T('AI tools are here to help.', 'Your AI Coach explains lessons and your P&L. AI review and the AI Scanner give a second opinion on a price, with reasons.', V.check(['AI Coach', 'AI review', 'AI Scanner'])),
      T('But the decision is always yours.', 'AI can be wrong, and it doesn’t know your budget or comfort zone. Read its reasons, check the two numbers, then you decide.', V.aiYou()),
      q(`You ask your AI Coach: “I bought 20 YES at 40${C}. What’s my max loss?” What should it answer?`, ['$8', '$20', '$12'], '20 × $0.40 = $8. That’s what you paid.', 'Max loss = contracts × price.'),
      q('You ask your AI Coach: “I hold NO and the event didn’t happen. What does each NO pay?” The right answer:', ['$1', '$0', 'What you paid'], 'NO wins when it doesn’t happen, and the right side pays $1.', 'NO means “it won’t happen”.'),
      q(`Your AI Coach reviews a trade: 10 YES bought at 70${C}. What’s the best case?`, ['$3 more than you paid', '$10 more than you paid', '$7 more than you paid'], '$10 payout − $7 paid = $3.', 'Total payout minus what you paid.')
    ], cta: { label: 'Ask your AI Coach', text: 'Got a question about a lesson or your P&L? Your AI Coach answers in plain English.', href: '#/coach' } },
    { id: 'd1l3', kind: 'lesson', title: 'Odds, not luck', steps: [
      T('Wait, isn’t this gambling?', 'Fair question! Both involve money and an uncertain result. The difference is how you decide and what you’re deciding on.', V.emoji('🤔', ['🎲', '📊'])),
      T('Casinos are built to beat you.', 'Roulette and slots are designed so the house wins over time. No amount of research changes how a wheel spins.', V.emoji('🎰', ['🏠', '💸'], 'shake')),
      T('Real events leave clues.', 'Inflation, jobs and Fed decisions come with data, official statements and history. Read the clues well and your odds get better.', V.emoji('🔍', ['📈', '📰', '🏛️'])),
      T('There’s no house here.', 'On an exchange, another person takes the other side of your trade. The price is just where buyers and sellers meet.', V.exchange()),
      T('Good judgment can be measured.', 'Say 70% on lots of events, and about 7 in 10 should happen. Track that, and you’ll know if your instincts are actually good.', V.dots(10, 7, 'said 70%: about 7 in 10 happen', true)),
      T('One trade proves nothing.', 'Any single call can go wrong, even with great reasoning. Skill shows up over many calls. Judge yourself on dozens, not one.', V.emoji('🪙', ['1 call', '50 calls'], 'flip')),
      T('Gamblers chase. Forecasters adjust.', 'After a loss, a gambler bets bigger to win it back. A forecaster checks the data, updates the estimate and moves on calmly.', V.emoji('🧘', ['📉', '📋'])),
      T('Some markets are regulated.', 'In the US, Kalshi is an exchange regulated by the CFTC, the agency that oversees futures markets. The rules of each market are public.', V.emoji('🏛️', ['✅', 'CFTC'])),
      T('Four simple rules.', 'Trade only when you have a reason. Know your max loss. Never chase losses. Write down every call and how it turned out.', V.check(['Have a reason', 'Know your max loss', 'Never chase losses', 'Log every call'])),
      T('That’s what Oddlin trains.', 'You make calls with play money, get an accuracy score and see where your judgment is strong or weak. All before any real decision.', V.emoji('🎯', ['📊', '💪'])),
      q('What makes forecasting different from a slot machine?', ['You can use data to judge the odds', 'The payout is always bigger', 'You can never lose'], 'Real events leave clues you can study. A slot machine doesn’t.', 'Think about what research can change.'),
      q('You lost a trade that had solid reasoning. What’s the forecaster move?', ['Review the data and keep sizes small', 'Double the next trade to win it back', 'Stop using data'], 'One loss doesn’t prove you wrong. Review, update, stay small.', 'Gamblers chase. Forecasters adjust.')
    ] },
    { id: 'd1r', kind: 'review', title: 'Day 1 quiz', steps: [
      q(`A YES contract costs 45${C}. What chance does the market give?`, ['About 45%', 'About 55%', 'About 4.5%'], 'Read cents as percent.'),
      q(`A contract costs 90${C}. What does that mean?`, ['Very likely, not certain', 'Already decided', 'Unlikely'], 'Only 100% would be certain.'),
      q('What does a winning contract pay at the end?', ['$1', 'The price you paid', 'It depends on volume'], 'Every winning contract pays $1.'),
      q(`You buy 10 YES at 62${C}. What’s your max loss?`, ['$6.20', '$10', '$3.80'], '10 × $0.62 = $6.20, what you paid.'),
      q(`You buy 10 YES at 62${C} and it happens. What’s your profit?`, ['$3.80', '$10', '$6.20'], '$10 back for $6.20 paid: $3.80 profit.'),
      q(`A 10${C} YES contract wins. What does it pay?`, ['$1', `10${C}`, '$10'], 'Every winner pays $1, whatever you paid.'),
      q('On an exchange, who takes the other side of your trade?', ['Another trader', 'A casino', 'Nobody'], 'Buyers and sellers meet. There is no house.'),
      q('What’s the best way to judge your forecasting skill?', ['Track accuracy over many calls', 'Look at your last trade', 'Count only your wins'], 'Skill shows over many calls, not one.'),
      q('After a loss, what does a forecaster do?', ['Reviews the data and adjusts', 'Doubles the next trade', 'Ignores the data'], 'Adjust calmly. Never chase.'),
      q(`A price moves from 40${C} to 60${C}. What does that tell you?`, ['The crowd thinks YES got more likely', 'The event already happened', 'Fees went up'], 'Prices follow the crowd’s current odds.')
    ] }
  ] },
  { day: 2, title: 'Your read vs the crowd', nodes: [
    { id: 'd2l1', kind: 'lesson', title: 'YES, NO and selling early', steps: [
      T('YES and NO are a pair.', 'They’re two sides of the same question. When YES becomes more likely, its price goes up and the NO price goes down.', V.seesaw()),
      T('Together they make about $1.', `YES at 70${C} means NO is about 30${C}. Tiny gaps happen because buyers pay a bit more than sellers get.`, V.stack([{ l: `YES 70${C}`, v: 70, c: 'var(--hit)' }, { l: `NO 30${C}`, v: 30, c: 'var(--miss)' }])),
      T('Think it won’t happen? Buy NO.', 'If you think a Fed cut is unlikely, you don’t have to sit it out. Buy NO. It pays $1 if there’s no cut.', V.coin('NO', '$1', 'pays if there’s no cut')),
      T('You can leave any time.', 'You don’t have to wait until the end. You can sell your contracts at the current price whenever you like.', V.emoji('🚪', ['🏃', 'SELL'])),
      T('Selling early can lock in a gain.', `Bought YES at 40${C} and now it’s 55${C}? Sell, and you keep 15${C} per contract, no matter what happens next.`, V.chart('up', `+15${C}`)),
      T('It can also limit a loss.', `Price fell from 40${C} to 25${C}? Selling now means you lose 15${C} per contract instead of the full 40${C}.`, V.chart('down', `−15${C}`)),
      T('Why sell early?', 'Maybe news changed your mind. Maybe you want the money for a better idea. Or you just like locking in a win.', V.emoji('💭', ['📰', '💡', '🔒'])),
      T('The spread is a small hidden cost.', 'Buyers pay a little more than sellers get. On busy markets the gap is tiny. On quiet ones it can eat your edge.', V.spread(63, 61)),
      T('Watch the moves, not just the end.', 'Lots of traders never wait for the final answer. They follow how the odds react to news and trade those moves.', V.chart('wave')),
      T('Try both in the simulator.', 'Hold one trade until the end. Sell another one early. Then compare what happened and which choice fit your thinking.', V.emoji('🧪', ['HOLD', 'SELL'])),
      q(`YES costs 70${C}. About what does NO cost?`, [`30${C}`, `70${C}`, '$1'], 'YES + NO ≈ $1.', 'The two sides add up to about $1.'),
      q(`You bought YES at 40${C}. Now it’s 55${C}. Profit if you sell one?`, [`15${C}`, `55${C}`, '$1'], `55${C} − 40${C} = 15${C}.`, 'Sell price minus buy price.')
    ] },
    { id: 'd2l2', kind: 'lesson', title: 'Make your own odds', steps: [
      T('Guess first, peek later.', 'If you see the price first, it sticks in your head. Write down your own guess before you look at what the crowd says.', V.emoji('🙈', [`62${C}?`, '📝'])),
      T('Start with history.', 'How often did this happen before? If the Fed cut at 3 of its last 10 meetings, about 30% is a fair place to start.', V.dots(10, 3, 'example: 3 cuts in 10 meetings')),
      T('Then adjust with fresh news.', 'Inflation cooling? Weak jobs report? Fed officials hinting? Each clue can nudge your number up or down from that start.', V.slider('30%', '60%', 'now: 45%')),
      T('Say a number, not a feeling.', '“75%” beats “probably”. A number can be checked later and teach you something. A vague feeling can’t.', V.emoji('📝', ['75%', '✅'])),
      { t: 'odds', big: 'Now compare with the crowd.', crowd: 62, you: 75, body: 'You say 75%. The market says 62%. That 13-point gap is where an opportunity might be hiding.' },
      T('A gap isn’t proof.', 'The crowd often knows something you missed. A big gap means: double-check your thinking before you trade.', V.emoji('🔍', ['⚠️', '13 pts'])),
      T('Expected value: the gap in money.', 'The formula is: your chance × $1 − price. It tells you what one contract is worth to you, if your odds are right.', V.chips(['chance', '×', '$1', '−', 'price'])),
      T('Let’s try it.', `You think 75%. YES costs 62${C}. So 0.75 × $1 − 62${C} = +13${C} per contract. Positive means it looks cheap to you.`, V.chips(['0.75', '×', '$1', '−', `62${C}`, '=', `+13${C}`], 'hit')),
      T('Negative? Skip it.', `You think 40%, YES costs 55${C}. That’s −15${C}. By your numbers YES is overpriced. Skip it, or take a look at NO.`, V.chips(['0.40', '×', '$1', '−', `55${C}`, '=', `−15${C}`], 'miss')),
      T('It’s an average, not a promise.', 'Even a good call can lose. Expected value pays off over many calls where your odds are better than the crowd’s.', V.average()),
      T('Tiny edge? Tiny trade.', 'A 2-point gap is easy to get wrong. Keep trades small unless your reasoning is strong and the gap is big.', V.bars([{ l: '2-pt edge', v: 12, top: 'small' }, { l: '15-pt edge', v: 60, top: 'bigger' }])),
      T('This is the Oddlin habit.', 'Guess, compare, calculate, decide. Repeat it on every market, and your accuracy score will show if it’s working.', V.cycle(['Guess', 'Compare', 'Calculate', 'Decide'])),
      q(`You think 70%. YES costs 50${C}. What does the math say?`, ['YES looks cheap', 'YES looks expensive', 'No difference'], `It’s worth 70${C} to you and costs 50${C}.`, `Compare 70${C} of value with the 50${C} price.`),
      q(`You think 60%. YES costs 50${C}. Expected value per contract?`, [`+10${C}`, `+60${C}`, `−10${C}`], `0.60 × $1 − 50${C} = +10${C}.`, 'Your chance × $1, minus the price.'),
      q('Why write your guess before looking at the price?', ['So the price doesn’t anchor you', 'Because prices are always wrong', 'To trade faster'], 'Seeing a number first pulls your guess toward it.', 'What happens to your guess after you see a number?')
    ] },
    { id: 'd2l3', kind: 'lesson', title: 'Are your odds any good?', steps: [
      T('70% is a promise you can check.', 'If your 70% calls come true about 70% of the time, you’re calibrated. That’s the real test of good judgment.', V.emoji('🎯', ['70%', '✅'])),
      T('Most beginners are too sure.', 'They say 90% for things that happen 70% of the time. Feeling confident is nice, but it costs you over many calls.', V.gauge(90, 70)),
      T('Some play it too safe.', 'They say 50% on everything. They’re rarely embarrassed, but they never find the spots where the crowd is clearly wrong.', V.gauge(50)),
      T('The Brier score keeps you honest.', 'It compares your number with what happened. 0 is perfect. 0.25 is what you’d get by always saying 50%.', V.numline()),
      T('You said 80%, and it happened.', 'Your score for that call: (0.8 − 1)² = 0.04. That’s close to zero, which is great.', V.chips(['(0.8 − 1)²', '=', '0.04'], 'hit')),
      T('You said 80%, and it didn’t.', 'Now it’s (0.8 − 0)² = 0.64. Ouch. Confident misses hurt a lot, so it pays to be honest about doubt.', V.chips(['(0.8 − 0)²', '=', '0.64'], 'miss')),
      T('Look at the average.', 'One bad call won’t define you. After 20 or 30 calls, your average starts telling you something real.', V.dots(30, 21, '30 calls: the pattern shows')),
      T('Use levels you can explain.', '60% when you lean yes. 80% when the data clearly points one way. 95% only when it’s nearly settled.', V.bars([{ l: 'lean yes', v: 60, top: '60%' }, { l: 'clear data', v: 80, top: '80%' }, { l: 'nearly done', v: 95, top: '95%' }])),
      T('Your AI Coach keeps score.', 'Every settled call updates your score. The coach shows where you drift, by topic and by how confident you were.', V.emoji('🤖', ['📊', '0.18'])),
      T('Your first-month goal.', 'Make at least 20 play-money calls and get your Brier score under 0.20. That beats guessing and shows real skill.', V.emoji('🏆', ['20 calls', '< 0.20'])),
      q('Your 90% calls come true 6 times in 10. You are…', ['Too sure (overconfident)', 'Too careful (underconfident)', 'Perfectly calibrated'], 'You said 90%, reality said 60%.', 'Compare what you said with what happened.'),
      q('Which Brier score is best?', ['0.12', '0.30', '0.25'], 'Lower is better. 0.12 beats always saying 50% (0.25).', 'Lower is better. 0.25 = always saying 50%.')
    ] },
    { id: 'd2r', kind: 'review', title: 'Day 2 quiz', steps: [
      q(`YES costs 62${C}. About what does NO cost?`, [`38${C}`, `62${C}`, '$1'], 'YES + NO ≈ $1.'),
      q(`You bought 4 YES at 50${C}. Now it’s 65${C}. Profit if you sell all 4?`, [`60${C}`, '$2.60', `15${C}`], `4 × 15${C} = 60${C}.`),
      q(`You think 75%. YES costs 62${C}. What does the math say?`, ['YES looks cheap', 'YES looks expensive', 'No edge'], `75${C} of value for 62${C}.`),
      q(`You think 80%. YES costs 70${C}. Expected value per contract?`, [`+10${C}`, `+80${C}`, `−10${C}`], `0.80 − 0.70 = +10${C}.`),
      q(`You think 20%. YES costs 35${C}. Expected value of YES?`, [`−15${C}`, `+15${C}`, `+20${C}`], `0.20 − 0.35 = −15${C}.`),
      q(`Same market: you think NO is 80% likely. NO costs 65${C}. Expected value of NO?`, [`+15${C}`, `−15${C}`, `+45${C}`], `0.80 − 0.65 = +15${C}.`),
      q('Why write your guess before checking the price?', ['To avoid anchoring on it', 'Prices are always wrong', 'It’s faster'], 'Seeing a number first pulls your guess toward it.'),
      q('What does “calibrated” mean?', ['Your 70% calls happen about 70% of the time', 'You win most trades', 'You always say 50%'], 'It compares what you said with what happened.'),
      q('You said 80% and it didn’t happen. Brier score for that call?', ['0.64', '0.04', '0.20'], '(0.8 − 0)² = 0.64.'),
      q(`Price 50${C}, your odds 52%. What’s the sensible move?`, ['Skip or go very small: the edge is thin', 'Go all in', 'Buy NO instead'], 'A 2-point edge is easy to get wrong.')
    ] }
  ] }
];
export const UPCOMING = ['Reading a Fed statement', 'Inflation data in 5 minutes', 'Jobs day', 'When to sell early', 'Elections and polls', 'Your first week in review'];
export const ALL = COURSE.flatMap(d => d.nodes);
export const CHEST = '<svg viewBox="0 0 64 56" aria-hidden="true"><path class="lid" d="M6 22C6 10 16 4 32 4s26 6 26 18v4H6z"/><g class="loot"><path d="M9 27Q32 17 55 27Z" fill="#3A2414"/><circle cx="22" cy="24.5" r="4.5" fill="#F5B301"/><circle cx="32" cy="22" r="5" fill="#FFD34D"/><circle cx="42" cy="24.5" r="4.5" fill="#F5B301"/></g><rect class="box" x="6" y="26" width="52" height="26" rx="4"/><rect class="band" x="6" y="24" width="52" height="6"/><rect class="lock" x="27" y="22" width="10" height="13" rx="2"/></svg>';
export const TEST_UNLOCK = false; // true opens every built lesson and quiz and makes quiz retakes free (for testing)
export const nextNode = () => ALL.find(n => !S.done.includes(n.id));
