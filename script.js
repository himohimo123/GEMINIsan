// YouTube IFrame Player APIを読み込むための準備
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// ★ここから追加・修正する部分です！

// あなたのYouTube Data APIキーをここに貼り付けます。
// 'YOUR_API_KEY_HERE' を、あなたが取得した実際のキーに置き換えてください！
const API_KEY = 'AIzaSyCsn8iuBszfjyocYFpDPgi-ezZ-BxmqCpE';

// 動画プールと履歴を管理する変数
let videoPool = []; // 次に再生する動画の候補をためておく場所
let playedVideoIds = new Set(); // すでに再生した動画のIDを記憶しておく場所（重複を防ぐため）
let likedVideoIds = new Set();  // 「いいね」した動画のIDを記憶しておく場所
let dislikedVideoIds = new Set(); // 「スキップ」した動画のIDを記憶しておく場所

// ブラウザにデータを保存・読み込みする関数
function saveUserData() {
    localStorage.setItem('playedVideoIds', JSON.stringify(Array.from(playedVideoIds)));
    localStorage.setItem('likedVideoIds', JSON.stringify(Array.from(likedVideoIds)));
    localStorage.setItem('dislikedVideoIds', JSON.stringify(Array.from(dislikedVideoIds)));
    console.log("ユーザーデータを保存しました！");
}

function loadUserData() {
    const storedPlayed = localStorage.getItem('playedVideoIds');
    const storedLiked = localStorage.getItem('likedVideoIds');
    const storedDisliked = localStorage.getItem('dislikedVideoIds');

    if (storedPlayed) {
        playedVideoIds = new Set(JSON.parse(storedPlayed));
    }
    if (storedLiked) {
        likedVideoIds = new Set(JSON.parse(storedLiked));
    }
    if (storedDisliked) {
        dislikedVideoIds = new Set(JSON.parse(storedDisliked));
    }
    console.log("ユーザーデータを読み込みました！");
}

// 次の動画を選んで再生する関数 (仮)
function playNextVideo() {
    // 今はまだダミーのIDを再生します
    // 後でAPIを使って本物の動画を選べるようにします
    const nextVideoId = 'tgbNymZ7vqY'; // 仮の次の動画ID（これは適当な音楽動画です）

    if (player && nextVideoId) {
        player.loadVideoById(nextVideoId);
        playedVideoIds.add(nextVideoId); // 再生した動画として追加
        saveUserData(); // データを保存
    } else {
        console.error("次の動画が見つからないか、プレイヤーが準備できていません。");
    }
}


// YouTubeプレイヤーの準備ができたら呼び出される関数
var player;
function onYouTubeIframeAPIReady() {
    // ユーザーデータをまず読み込みます
    loadUserData();

    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: 'dQw4w9WgXcQ', // 最初に見せる動画のID
        playerVars: {
            'autoplay': 1,
            'mute': 1,     // 音をミュートにします（自動再生のため）
            'controls': 1,
            'loop': 0,
            'rel': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

// プレイヤーの準備が完了した時に呼ばれる関数
function onPlayerReady(event) {
    event.target.playVideo(); // 準備ができたら再生します
    console.log("YouTubeプレイヤーの準備ができました！");
    playedVideoIds.add('dQw4w9WgXcQ'); // 初回再生の動画も履歴に追加
    saveUserData(); // データを保存
}

// プレイヤーの状態が変わった時に呼ばれる関数
function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.ENDED) {
        console.log("動画の再生が終わりました。次の動画を探します...");
        playNextVideo(); // 動画が終わったら次の動画を再生
    }
}

// スキップボタンが押された時の処理
document.getElementById('skipButton').addEventListener('click', function() {
    const currentVideoId = player.getVideoData().video_id;
    if (currentVideoId) {
        dislikedVideoIds.add(currentVideoId); // スキップした動画として追加
        console.log("スキップボタンが押されました！動画ID:", currentVideoId);
        saveUserData(); // データを保存
        playNextVideo(); // 次の動画を再生
    }
});

// いいねボタンが押された時の処理
document.getElementById('likeButton').addEventListener('click', function() {
    const currentVideoId = player.getVideoData().video_id;
    if (currentVideoId) {
        likedVideoIds.add(currentVideoId); // いいねした動画として追加
        console.log("いいねボタンが押されました！動画ID:", currentVideoId);
        saveUserData(); // データを保存
    }
});

// ★ここまで追加・修正する部分です！