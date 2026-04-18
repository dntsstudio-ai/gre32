// ============================================================
//  config/config.js — Voice Acting Team
// ============================================================

export const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCT524d1MZAXIqwSNS0JX7E9c5EcVMb9mM",
    authDomain:        "voice-acting-team.firebaseapp.com",
    projectId:         "voice-acting-team",
    storageBucket:     "voice-acting-team.firebasestorage.app",
    messagingSenderId: "587861119144",
    appId:             "1:587861119144:web:9d250f61fcec19c7f6f29d",
    measurementId:     "G-98LRHNZY2B"
};

export const EMAILJS_CONFIG = {
    serviceId:       'service_sws',
    templateSuggest: 'template_suggest',
    publicKey:       'FExFPIAtSKcFcS2yy'
};

export const SOCIAL_LINKS = {
    vk:       'https://vk.com/voiceactingteam1',
    telegram: 'https://t.me/VoiceActingTeam1',
    youtube:  'https://youtube.com/@voiceactingteam1?si=0PoFChfUBfstrFrL',
    tiktok:   'https://www.tiktok.com/@voice.acting.team8?_t=ZN-90cUs7oh1i2&_r=1',
    boosty:   'https://boosty.to/voiceactingteam',
    twitch:   'https://vattchelovekizvuchat.com/twich'
};

export const JOIN_FORM_URL        = 'https://t.me/VoiceActingTeam1';
export const PLACEHOLDER_IMG      = 'https://placehold.co/300x420/1a0a2e/7c3aed?text=VAT';
export const PLACEHOLDER_TEAM_IMG = 'https://api.dicebear.com/7.x/identicon/svg';

export const VIEW_COUNT_AFTER_MS = 10 * 60 * 1000;

export const AUTO_ACHIEVEMENTS = [
    { id: 'first_view',     name: 'Первый просмотр',   desc: 'Посмотрел первый релиз',         img: '👁️', trigger: 'views_1'    },
    { id: 'views_10',       name: 'Киноман',            desc: '10 просмотренных релизов',        img: '🎬', trigger: 'views_10'   },
    { id: 'views_50',       name: 'Синефил',            desc: '50 просмотренных релизов',        img: '🏆', trigger: 'views_50'   },
    { id: 'first_comment',  name: 'Голос',              desc: 'Оставил первый комментарий',      img: '💬', trigger: 'comment_1'  },
    { id: 'first_like',     name: 'Меценат',            desc: 'Поставил первый лайк',            img: '❤️', trigger: 'like_1'     },
    { id: 'first_favorite', name: 'Коллекционер',       desc: 'Добавил релиз в избранное',       img: '⭐', trigger: 'favorite_1' },
    { id: 'subs_1',         name: 'Популярный',         desc: 'Получил первого подписчика',      img: '🌟', trigger: 'subs_1'     },
    { id: 'suggest_1',      name: 'Инициатор',          desc: 'Предложил проект для озвучки',    img: '💡', trigger: 'suggest_1'  },
    { id: 'profile_filled', name: 'Личность',           desc: 'Заполнил профиль полностью',      img: '🎭', trigger: 'profile_ok' },
    { id: 'newcomer',       name: 'Новичок',            desc: 'Зарегистрировался на сайте',      img: '👋', trigger: null         },
];
