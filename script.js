// YouTube IFrame Player APIを読み込むための準備
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// あなたのYouTube Data APIキーをここに貼り付けます。
const API_KEY = 'YOUR_API_KEY_HERE';

// 動画プールと履歴を管理する変数
let videoPool = []; // 次に再生する動画の候補をためておく場所
let playedVideoIds = new Set(); // すでに再生した動画のIDを記憶しておく場所（重複を防ぐため）
let likedVideoIds = new Set();  // 「いいね」した動画のIDを記憶しておく場所
let dislikedVideoIds = new Set(); // 「スキップ」した動画のIDを記憶しておく場所
const currentPlayingVideoIdKey = 'currentPlayingVideoId'; // 現在再生中の動画IDを保存するためのキー
let currentSearchQuery = ''; // 現在の検索クエリを保存

// ブラウザにデータを保存・読み込みする関数
function saveUserData() {
    localStorage.setItem('playedVideoIds', JSON.stringify(Array.from(playedVideoIds)));
    localStorage.setItem('likedVideoIds', JSON.stringify(Array.from(likedVideoIds)));
    localStorage.setItem('dislikedVideoIds', JSON.stringify(Array.from(dislikedVideoIds)));
    // 現在再生中の動画IDも保存
    const currentVideoId = player ? player.getVideoData().video_id : null;
    if (currentVideoId) {
        localStorage.setItem(currentPlayingVideoIdKey, currentVideoId);
    } else {
        localStorage.removeItem(currentPlayingVideoIdKey);
    }
    console.log("ユーザーデータを保存しました！");
}

function loadUserData() {
    const storedPlayed = localStorage.getItem('playedVideoIds');
    const storedLiked = localStorage.getItem('likedVideoIds');
    const storedDisliked = localStorage.getItem('dislikedVideoIds');
    const storedCurrentVideoId = localStorage.getItem(currentPlayingVideoIdKey);

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
    return storedCurrentVideoId; // 現在再生中だった動画IDを返す
}

// --- YouTube Data APIを使って動画を検索する関数 ---
async function fetchVideosFromYouTube(query = '', maxResults = 10) {
    let url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}`;

    // 初期ロード時やプールが少ない場合は、人気動画も混ぜる
    if (!query && videoPool.length < 5) {
        url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&part=snippet,contentDetails&chart=mostPopular&regionCode=JP&maxResults=${maxResults}`;
    } else if (query) {
         // 検索クエリがある場合、人気順にソート（関連性ではなく）
        url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}&order=viewCount`;
    }


    try {
        const response = await fetch(url); // YouTube APIにリクエストを送る
        const data = await response.json(); // 受け取ったデータをJavaScriptで使える形にする

        const newVideos = data.items.map(item => ({
            id: item.id.videoId || item.id, // search.listとvideos.listでIDの場所が違うため
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url // ミディアムサイズのサムネイル
        })).filter(video =>
            // まだ再生していない、スキップしていない動画だけをフィルタリング
            !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) && video.id
        );
        
        // 動画プールに新しい動画を追加
        videoPool = videoPool.concat(newVideos);
        // 重複排除（念のため）
        const uniqueVideoIds = new Set(videoPool.map(v => v.id));
        videoPool = Array.from(uniqueVideoIds).map(id => videoPool.find(v => v.id === id));

        console.log("動画を検索し、プールに追加しました。現在のプールサイズ:", videoPool.length);
        displayCandidateVideos(); // 候補動画を表示する（後で作成）

    } catch (error) {
        console.error("YouTube APIでの動画検索中にエラーが発生しました:", error);
    }
}

// --- 次の動画を選んで再生する関数 ---
function playNextVideo() {
    let nextVideo = null;

    // まずプールから未再生の動画を探す
    while (videoPool.length > 0) {
        const candidate = videoPool.shift(); // プールから最初の動画を取り出す
        if (!playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id)) {
            nextVideo = candidate;
            break;
        }
    }

    // プールに動画がない、または全て再生済み/スキップ済みの場合
    if (!nextVideo) {
        console.log("動画プールが空です。新しい動画を検索します。");
        // ここでAPIを叩いて新しい動画を探す
        // 今回はまだキーワードが複雑ではないので空のクエリで人気動画や一般的な動画を取得
        fetchVideosFromYouTube(currentSearchQuery, 20); // 20件取得を試みる
        // すぐに再生できる動画がない場合があるので、一旦初期動画に戻すか、ユーザーに待機を促す
        // 今回は新しい動画がフェッチされるまで少し待つ前提
        if (videoPool.length === 0) { // まだプールが空なら初期動画を再生
            nextVideo = { id: 'dQw4w9WgXcQ', title: 'Default Video', thumbnail: '' };
        } else { // フェッチで追加された動画から選ぶ
            nextVideo = videoPool.shift();
        }
    }

    if (player && nextVideo && nextVideo.id) {
        player.loadVideoById(nextVideo.id);
        playedVideoIds.add(nextVideo.id); // 再生した動画として追加
        saveUserData(); // データを保存
        displayCandidateVideos(); // 候補動画の表示を更新
    } else {
        console.error("次の動画が見つからないか、プレイヤーが準備できていません。", nextVideo);
        // エラー時もとりあえずデフォルト動画に戻す
        player.loadVideoById('dQw4w9WgXcQ');
        playedVideoIds.add('dQw4w9WgXcQ');
        saveUserData();
    }
}


// --- 候補動画をHTMLに表示する関数 ---
function displayCandidateVideos() {
    const candidateContainer = document.getElementById('候補動画を表示する場所');
    candidateContainer.innerHTML = ''; // 一度表示をクリア

    // プールから、まだ表示されていない、再生済み/スキップ済みでない動画を最大6件表示
    const uniqueCandidates = [];
    const displayedIds = new Set();
    for (const video of videoPool) {
        if (!playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) && !displayedIds.has(video.id) && video.id) {
            uniqueCandidates.push(video);
            displayedIds.add(video.id);
        }
        if (uniqueCandidates.length >= 6) break; // 最大6件表示
    }


    uniqueCandidates.forEach(video => {
        const videoDiv = document.createElement('div');
        videoDiv.className = 'video-candidate';
        videoDiv.dataset.videoId = video.id; // クリック時に動画IDがわかるように

        videoDiv.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="video-candidate-title">${video.title}</div>
        `;
        
        // クリックしたらその動画を再生する
        videoDiv.addEventListener('click', () => {
            player.loadVideoById(video.id);
            playedVideoIds.add(video.id);
            // 再生したらプールから削除（または見たものとしてマーク）
            videoPool = videoPool.filter(v => v.id !== video.id);
            saveUserData();
            displayCandidateVideos(); // 表示を更新
        });

        candidateContainer.appendChild(videoDiv);
    });
}

// YouTubeプレイヤーの準備ができたら呼び出される関数
var player;
function onYouTubeIframeAPIReady() {
    const lastPlayedVideoId = loadUserData(); // ユーザーデータをまず読み込み、前回再生中の動画IDを取得

    player = new YT.Player('player', {
        height: '390',
        width: '640',
        videoId: lastPlayedVideoId || 'dQw4w9WgXcQ', // 前回再生中の動画がなければ初期動画
        playerVars: {
            'autoplay': 1,
            'mute': 1,
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
    event.target.playVideo();
    console.log("YouTubeプレイヤーの準備ができました！");
    const currentVideoId = player.getVideoData().video_id;
    if (currentVideoId && !playedVideoIds.has(currentVideoId)) {
        playedVideoIds.add(currentVideoId); // 初回再生の動画も履歴に追加
        saveUserData();
    }
    // 初期ロード時と、動画プールが空の場合に動画を検索
    if (videoPool.length < 5) {
        fetchVideosFromYouTube('音楽', 20); // 最初に20件の音楽動画を取得
        currentSearchQuery = '音楽'; // 初期検索クエリを設定
    }
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
    if (currentVideoId && !dislikedVideoIds.has(currentVideoId)) { // 同じ動画を何度もスキップしないように
        dislikedVideoIds.add(currentVideoId); // スキップした動画として追加
        console.log("スキップボタンが押されました！動画ID:", currentVideoId);
        saveUserData(); // データを保存
        displayCandidateVideos(); // 候補動画の表示を更新
    }
    playNextVideo(); // 次の動画を再生
});

// いいねボタンが押された時の処理
document.getElementById('likeButton').addEventListener('click', function() {
    const currentVideoId = player.getVideoData().video_id;
    if (currentVideoId && !likedVideoIds.has(currentVideoId)) { // 同じ動画を何度もいいねしないように
        likedVideoIds.add(currentVideoId); // いいねした動画として追加
        console.log("いいねボタンが押されました！動画ID:", currentVideoId);
        saveUserData(); // データを保存
        // いいねしたからといってすぐに次の動画には進まない
    }
});

// ページを閉じる前にデータを保存する（ブラウザタブを閉じる、F5以外でページ遷移など）
window.addEventListener('beforeunload', saveUserData);