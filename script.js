// YouTube IFrame Player APIを読み込むための準備
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// あなたのYouTube Data APIキーをここに貼り付けます。
const API_KEY = 'AIzaSyCsn8iuBszfjyocYFpDPgi-ezZ-BxmqCpE'; // ★★★ここをあなたのAPIキーに貼り付けてください！★★★

// ★★★ここをモハPチャンネルの動画IDとキーワードに設定します！★★★
const INITIAL_VIDEO_ID = '953Ww9RNY34'; // モハPチャンネルの「日本の30-40年金利過去最高更新」の動画ID
const INITIAL_SEARCH_QUERY = 'モハPチャンネル 経済'; // 初期に検索するキーワード
// ★★★-----------------------------------------------------------★★★

// 動画プールと履歴を管理する変数
let videoPool = []; // 次に再生する動画の候補をためておく場所
let playedVideoIds = new Set(); // すでに再生した動画のIDを記憶しておく場所（重複を防ぐため）
let likedVideoIds = new Set();  // 「いいね」した動画のIDを記憶しておく場所
let dislikedVideoIds = new Set(); // 「スキップ」した動画のIDを記憶しておく場所
let neverShowVideoIds = new Set(); // ★新機能★ 「二度と表示しない」動画のIDを記憶しておく場所
const currentPlayingVideoIdKey = 'currentPlayingVideoId'; // 現在再生中の動画IDを保存するためのキー
let currentSearchQuery = INITIAL_SEARCH_QUERY; // 現在の検索クエリを初期設定

// HTML要素への参照を保存
const videoTitleElement = document.getElementById('videoTitle');
const channelTitleElement = document.getElementById('channelTitle');


// ブラウザにデータを保存・読み込みする関数
function saveUserData() {
    localStorage.setItem('playedVideoIds', JSON.stringify(Array.from(playedVideoIds)));
    localStorage.setItem('likedVideoIds', JSON.stringify(Array.from(likedVideoIds)));
    localStorage.setItem('dislikedVideoIds', JSON.stringify(Array.from(dislikedVideoIds)));
    localStorage.setItem('neverShowVideoIds', JSON.stringify(Array.from(neverShowVideoIds))); // ★新機能★
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
    const storedNeverShow = localStorage.getItem('neverShowVideoIds'); // ★新機能★
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
    if (storedNeverShow) { // ★新機能★
        neverShowVideoIds = new Set(JSON.parse(storedNeverShow));
    }
    console.log("ユーザーデータを読み込みました！");
    return storedCurrentVideoId; // 現在再生中だった動画IDを返す
}

// --- YouTube Data APIを使って動画を検索する関数 ---
async function fetchVideosFromYouTube(query = '', maxResults = 10) {
    let url;
    // 検索クエリがある場合
    if (query) {
        // search APIを使う（キーワード検索）
        url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}&order=relevance`;
    } else {
        // クエリがない場合は、videos APIの人気動画チャートを使う
        url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&part=snippet,contentDetails&chart=mostPopular&regionCode=JP&maxResults=${maxResults}`;
    }

    try {
        const response = await fetch(url); // YouTube APIにリクエストを送る
        const data = await response.json(); // 受け取ったデータをJavaScriptで使える形にする

        const newVideos = data.items.map(item => ({
            id: item.id.videoId || item.id, // search.listとvideos.listでIDの場所が違うため
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url, // ミディアムサイズのサムネイル
            tags: item.snippet.tags || [], // タグ情報
            channelTitle: item.snippet.channelTitle // ★新機能★ チャンネル名も取得
        })).filter(video =>
            // まだ再生していない、スキップしていない、二度と表示しない動画、かつ有効なIDを持つ動画だけをフィルタリング
            !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) && !neverShowVideoIds.has(video.id) && video.id // ★新機能★
        );
        
        // 動画プールに新しい動画を追加
        videoPool = videoPool.concat(newVideos);
        // 重複排除（念のため）
        const uniqueVideoIds = new Set(videoPool.map(v => v.id));
        videoPool = Array.from(uniqueVideoIds).map(id => videoPool.find(v => v.id === id));

        console.log("動画を検索し、プールに追加しました。現在のプールサイズ:", videoPool.length);
        displayCandidateVideos(); // 候補動画を表示する

    } catch (error) {
        console.error("YouTube APIでの動画検索中にエラーが発生しました:", error);
        // APIキーのエラーなど、致命的なエラーの場合はユーザーに通知する
        alert('動画の読み込み中にエラーが発生しました。APIキーを確認してください。');
    }
}

// --- いいねした動画のタグから関連キーワードを生成する関数 ---
async function generateSmartSearchQuery() {
    if (likedVideoIds.size === 0) {
        // いいねした動画がない場合は、初期の検索クエリを使用
        currentSearchQuery = INITIAL_SEARCH_QUERY;
        return;
    }

    let allTags = [];
    let channelTitles = new Set(); // ★新機能★ チャンネル名も収集
    // いいねした動画のIDをすべて取得
    const likedVideoIdsArray = Array.from(likedVideoIds);

    // YouTube Data APIのvideos.listを使って、いいねした動画のタグとチャンネル名を取得
    // APIは一度に50件までしかIDを受け付けないため、分割してリクエスト
    for (let i = 0; i < likedVideoIdsArray.length; i += 50) {
        const batchIds = likedVideoIdsArray.slice(i, i + 50);
        const url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&part=snippet&id=${batchIds.join(',')}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            data.items.forEach(item => {
                if (item.snippet) {
                    if (item.snippet.tags) {
                        allTags = allTags.concat(item.snippet.tags);
                    }
                    if (item.snippet.channelTitle) { // ★新機能★
                        channelTitles.add(item.snippet.channelTitle);
                    }
                }
            });
        } catch (error) {
            console.error("いいねした動画のタグ/チャンネル取得中にエラーが発生しました:", error);
        }
    }

    // 最も頻繁に出てくるタグをいくつか選ぶ（例: 上位3つ）
    const tagCounts = {};
    allTags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });

    const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
    const topTags = sortedTags.slice(0, 3); // 上位3つのタグを選ぶ

    // チャンネル名とタグを組み合わせる（例: チャンネル名2つとタグ1つ、またはタグ3つ）
    let smartQueryParts = [];
    if (channelTitles.size > 0) {
        // チャンネル名がある場合は、まずチャンネル名を優先
        smartQueryParts = Array.from(channelTitles).slice(0, 2); // 上位2つのチャンネル名
        // 残りの枠にタグを追加
        smartQueryParts = smartQueryParts.concat(topTags.slice(0, 3 - smartQueryParts.length));
    } else {
        // チャンネル名がない場合は、タグのみ
        smartQueryParts = topTags;
    }


    if (smartQueryParts.length > 0) {
        // 選ばれたキーワードをスペースでつなげて新しい検索クエリにする
        currentSearchQuery = smartQueryParts.join(' ');
        console.log("いいねした動画から生成された検索クエリ:", currentSearchQuery);
    } else {
        // タグもチャンネル名も見つからない場合は、初期の検索クエリに戻す
        currentSearchQuery = INITIAL_SEARCH_QUERY;
    }
}

// --- 次の動画を選んで再生する関数 ---
async function playNextVideo() {
    let nextVideo = null;

    // まずプールから未再生、未スキップ、二度と表示しない動画を探す
    while (videoPool.length > 0) {
        const candidate = videoPool.shift(); // プールから最初の動画を取り出す
        if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id) && !neverShowVideoIds.has(candidate.id)) { // ★新機能★
            nextVideo = candidate;
            break;
        }
    }

    // プールに動画がない、または全て再生済み/スキップ済み/二度と表示しない場合
    if (!nextVideo) {
        console.log("動画プールが空です。新しい動画を検索します。");
        await generateSmartSearchQuery(); // まずスマートな検索クエリを生成
        await fetchVideosFromYouTube(currentSearchQuery, 20); // そのクエリで20件取得を試みる

        // 新しくフェッチで追加された動画から選ぶ
        if (videoPool.length === 0) { // まだプールが空なら初期動画を再生
            nextVideo = { id: INITIAL_VIDEO_ID, title: 'Default Video', thumbnail: '', channelTitle: 'Default Channel' }; // ★新機能★
        } else {
            nextVideo = videoPool.shift(); 
        }
    }

    if (player && nextVideo && nextVideo.id) {
        player.loadVideoById(nextVideo.id);
        playedVideoIds.add(nextVideo.id); // 再生した動画として追加
        saveUserData(); // データを保存
        displayCandidateVideos(); // 候補動画の表示を更新

        // ★新機能★ 動画のタイトルとチャンネル名を表示
        videoTitleElement.textContent = nextVideo.title;
        channelTitleElement.textContent = nextVideo.channelTitle;

    } else {
        console.error("次の動画が見つからないか、プレイヤーが準備できていません。", nextVideo);
        // エラー時もとりあえずデフォルト動画に戻す
        player.loadVideoById(INITIAL_VIDEO_ID);
        playedVideoIds.add(INITIAL_VIDEO_ID);
        saveUserData();
        videoTitleElement.textContent = "動画の読み込みに失敗しました"; // ★新機能★
        channelTitleElement.textContent = "チャンネル情報なし"; // ★新機能★
    }
}


// --- 候補動画をHTMLに表示する関数 ---
function displayCandidateVideos() {
    const candidateContainer = document.getElementById('候補動画を表示する場所'); // HTMLのidと合わせる
    if (!candidateContainer) {
        console.warn("ID '候補動画を表示する場所' を持つ要素が見つかりませんでした。");
        return;
    }
    candidateContainer.innerHTML = ''; // 一度表示をクリア

    // プールから、まだ表示されていない、再生済み/スキップ済み/二度と表示しない動画を最大6件表示
    const uniqueCandidates = [];
    const displayedIds = new Set();
    for (const video of videoPool) {
        if (video && video.id && !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) && !neverShowVideoIds.has(video.id) && !displayedIds.has(video.id)) { // ★新機能★
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
        videoId: lastPlayedVideoId || INITIAL_VIDEO_ID, // 前回再生中の動画がなければ初期動画
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
async function onPlayerReady(event) {
    event.target.playVideo();
    console.log("YouTubeプレイヤーの準備ができました！");
    const currentVideoId = player.getVideoData().video_id;
    // ★新機能★ 最初の動画のタイトルとチャンネル名を表示
    const videoData = player.getVideoData();
    videoTitleElement.textContent = videoData.title || 'タイトルなし';
    channelTitleElement.textContent = videoData.author || 'チャンネル名なし';


    if (currentVideoId && !playedVideoIds.has(currentVideoId)) {
        playedVideoIds.add(currentVideoId); // 初回再生の動画も履歴に追加
        saveUserData();
    }
    // まず好みに合わせた検索クエリを生成
    await generateSmartSearchQuery(); // ここで生成を待つ
    // 初期ロード時と、動画プールが空の場合に動画を検索
    if (videoPool.length < 5) { // プールが少ない場合に新しい動画を検索
        fetchVideosFromYouTube(currentSearchQuery, 20); // 生成されたクエリで20件取得
    }
}

// プレイヤーの状態が変わった時に呼ばれる関数
function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.ENDED) {
        console.log("動画の再生が終わりました。次の動画を探します...");
        playNextVideo(); // 動画が終わったら次の動画を再生
    } else if (event.data == YT.PlayerState.PLAYING) { // 再生中にタイトルとチャンネル名を更新
        const videoData = player.getVideoData();
        videoTitleElement.textContent = videoData.title || 'タイトルなし';
        channelTitleElement.textContent = videoData.author || 'チャンネル名なし';
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

// ★新機能★ 「この動画を二度と表示しない」ボタンが押された時の処理
document.getElementById('neverShowButton').addEventListener('click', function() {
    const currentVideoId = player.getVideoData().video_id;
    if (currentVideoId && !neverShowVideoIds.has(currentVideoId)) {
        neverShowVideoIds.add(currentVideoId); // 二度と表示しないリストに追加
        playedVideoIds.add(currentVideoId); // 再生済みにも追加し、プールからも除外されやすくする
        console.log("「この動画を二度と表示しない」ボタンが押されました！動画ID:", currentVideoId);
        alert('この動画は今後表示されなくなります。'); // ユーザーに通知
        saveUserData(); // データを保存
        displayCandidateVideos(); // 候補動画の表示を更新
    }
    playNextVideo(); // 次の動画を再生
});

// ページを閉じる前にデータを保存する（ブラウザタブを閉じる、F5以外でページ遷移など）
window.addEventListener('beforeunload', saveUserData);