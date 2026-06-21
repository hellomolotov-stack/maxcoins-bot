// GIF-константы для ситуационных ответов бота
// Источник: tenor.com

// Pool of celebration cats shown randomly on task approval
const TASK_APPROVED_CATS = [
  'https://media.tenor.com/VGWpu8FH82AAAAAM/happy-cat-yippee-cat.gif',   // Yippee cat
  'https://media.tenor.com/3IYpyDhud_YAAAAM/cat-dancing-gif-dancing-cat.gif', // Dancing cat
  'https://media.tenor.com/yCW643G5PuYAAAAM/winner-win.gif',             // Winner cat
  'https://media.tenor.com/fitGu2TwtHoAAAAM/cat-hyppy.gif',              // Happy jumping cat
  'https://media.tenor.com/lfDATg4Bhc0AAAAM/happy-cat.gif',              // Happy cat
  'https://media.tenor.com/UcZyRYM47ocAAAAM/smiling-cat-happy-cat.gif',  // Smiling cat
  'https://media.tenor.com/mBvne9YeD9EAAAAM/international-cat-day-cat-day.gif', // Celebrating cat
  'https://media.tenor.com/wjFmq1-9NlkAAAAM/birthday-get-well-soon.gif', // Party cat
  'https://media.tenor.com/r-sIqRnUnJoAAAAM/funny-jump.gif',             // Jumping cat
  'https://media.tenor.com/i_rMKdLlNlYAAAAM/cat-smiling-cat-cute.gif',   // Cute smiling cat
];

export function randomApprovalGif(): string {
  return TASK_APPROVED_CATS[Math.floor(Math.random() * TASK_APPROVED_CATS.length)];
}

export const GIF = {
  TASK_APPROVED:    randomApprovalGif,  // call as GIF.TASK_APPROVED() each time
  COINS_EARNED:     randomApprovalGif,

  // Sad Banana Cat — плачет в костюме банана
  TASK_REJECTED:    'https://media.tenor.com/u8M7kk5ZXmwAAAAC/banana-cat-crying.gif',
  WISH_REJECTED:    'https://media.tenor.com/u8M7kk5ZXmwAAAAC/banana-cat-crying.gif',

  // Dancing Cat — танцует
  WISH_APPROVED:    'https://media.tenor.com/4PyP3jv5OAQAAAAC/cat.gif',

  // Кот Максвелл — крутится
  WISH_REDEEMED:    'https://media.tenor.com/iBRHixOqQDEAAAAC/spincat-spinning.gif',
  WELCOME:          'https://media.tenor.com/iBRHixOqQDEAAAAC/spincat-spinning.gif',

  // Vibing Cat — качает головой
  TASK_SUBMITTED:   'https://media.tenor.com/3fWNoUgRYFEAAAAC/cat-vibe-cat-meme.gif',
  NEW_TASK:         'https://media.tenor.com/3fWNoUgRYFEAAAAC/cat-vibe-cat-meme.gif',

  // Кот бьёт другого кота
  DISTRACTION:      'https://media.tenor.com/cufstBCUfvgAAAAC/cat-hitting.gif',

  // Pop Cat
  CHILD_WANTS_TALK: 'https://media.tenor.com/2hKId-8ffdYAAAAC/chog-chigunz.gif',

  // Shocked Cat
  SHOCKED:          'https://media.tenor.com/SuVGs-GL7RoAAAAC/shocked-shocked-cat.gif',

  // Grumpy Cat
  GRUMPY:           'https://media.tenor.com/6IKOpbGWD_QAAAAC/cat-with-wiered-and-cute-reactions-cat.gif',
};
