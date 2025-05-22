// YouTube IFrame Player APIを読み込むための準備
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// YouTubeプレイヤーの準備ができたら呼び出される関数
var player;
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: 'dQw4w9WgXcQ', // これはテスト用の動画IDです
        playerVars: {
            'autoplay': 1, // 自動で再生を開始します
            'mute': 1,     // ★音をミュートにします（自動再生のため）
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
}

// プレイヤーの状態が変わった時に呼ばれる関数
function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.ENDED) {
        console.log("動画の再生が終わりました。次の動画を探します...");
        // ここに次の動画を探して再生するコードを追加していきます
    }
}

// スキップボタンが押された時の処理
document.getElementById('skipButton').addEventListener('click', function() {
    console.log("スキップボタンが押されました！");
    // ここにスキップした時の処理を追加していきます
});

// いいねボタンが押された時の処理
document.getElementById('likeButton').addEventListener('click', function() {
    console.log("いいねボタンが押されました！");
    // ここにいいねした時の処理を追加していきます
});