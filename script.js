// YouTube IFrame Player APIを読み込むための準備
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// あなたのYouTube Data APIキーをここに貼り付けます。
const API_KEY = 'AIzaSyCsn8iuBszfjyocYFpDPgi-ezZ-BxmqCpE'; // ★★★ここをあなたのAPIキーに貼り付けてください！★★★

// ★★★ここをモハPチャンネルの初期検索キーワードに設定します！★★★
// INITIAL_VIDEO_IDは直接指定せず、検索で取得するように変更しました。
const INITIAL_SEARCH_QUERY = 'モハPチャンネル 経済'; // 初期に検索するキーワード
// ★★★-----------------------------------------------------------★★★

// 動画プールと履歴を管理する変数
let videoPool = []; // 次に再生する動画の候補をためておく場所
let playedVideoIds = new Set(); // すでに再生した動画のIDを記憶しておく場所（重複を防ぐため）
let likedVideoIds = new Set();  // 「いいね」した動画のIDを記憶しておく場所
let dislikedVideoIds = new Set(); // 「スキップ」した動画のIDを記憶しておく場所
let neverShowVideoIds = new Set(); // 「二度と表示しない」動画のIDを記憶しておく場所
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
    localStorage.setItem('neverShowVideoIds', JSON.stringify(Array.from(neverShowVideoIds)));
    // 現在再生中の動画IDも保存 (playerが準備できているか確認)
    if (player && typeof player.getVideoData === 'function' && player.getVideoData() && player.getVideoData().video_id) {
        const currentVideoId = player.getVideoData().video_id;
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
    const storedNeverShow = localStorage.getItem('neverShowVideoIds');
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
    if (storedNeverShow) {
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

        // APIからのレスポンス構造が異なる場合があるため、安全にチェック
        if (!data.items || !Array.isArray(data.items)) {
            console.warn("YouTube APIからのレスポンスに問題があります。itemsがありません。", data);
            return []; // 空の配列を返す
        }

        const newVideos = data.items.map(item => ({
            id: item.id.videoId || item.id, // search.listとvideos.listでIDの場所が違うため
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url, // ミディアムサイズのサムネイル
            tags: item.snippet.tags || [], // タグ情報
            channelTitle: item.snippet.channelTitle // チャンネル名も取得
        })).filter(video =>
            // まだ再生していない、スキップしていない、二度と表示しない動画、かつ有効なIDを持つ動画だけをフィルタリング
            video.id && !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) && !neverShowVideoIds.has(video.id)
        );
        
        // 動画プールに新しい動画を追加
        videoPool = videoPool.concat(newVideos);
        // 重複排除（念のため）
        const uniqueVideoIds = new Set(videoPool.map(v => v.id));
        videoPool = Array.from(uniqueVideoIds).map(id => videoPool.find(v => v.id === id));

        console.log("動画を検索し、プールに追加しました。現在のプールサイズ:", videoPool.length);
        displayCandidateVideos(); // 候補動画を表示する
        return newVideos; // 新しく取得した動画を返す

    } catch (error) {
        console.error("YouTube APIでの動画検索中にエラーが発生しました:", error);
        // APIキーのエラーなど、致命的なエラーの場合はユーザーに通知する
        alert('動画の読み込み中にエラーが発生しました。APIキーを確認してください。');
        return []; // エラー時は空の配列を返す
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
    let channelTitles = new Set(); // チャンネル名も収集
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
            if (!data.items || !Array.isArray(data.items)) {
                console.warn("タグ/チャンネル取得APIからのレスポンスに問題があります。itemsがありません。", data);
                continue; // 次のバッチへ
            }
            data.items.forEach(item => {
                if (item.snippet) {
                    if (item.snippet.tags) {
                        allTags = allTags.concat(item.snippet.tags);
                    }
                    if (item.snippet.channelTitle) {
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
    // ループ内で新しい動画を取得する可能性があるため、無限ループにならないよう注意
    while (videoPool.length > 0) {
        const candidate = videoPool.shift(); // プールから最初の動画を取り出す
        if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id) && !neverShowVideoIds.has(candidate.id)) {
            nextVideo = candidate;
            break;
        }
    }

    // プールに動画がない、または全て再生済み/スキップ済み/二度と表示しない場合
    if (!nextVideo) {
        console.log("動画プールが空です。新しい動画を検索します。");
        await generateSmartSearchQuery(); // まずスマートな検索クエリを生成
        
        // 新しい動画をフェッチし、その中から有効なものを探す
        const fetchedVideos = await fetchVideosFromYouTube(currentSearchQuery, 20); // 生成されたクエリで20件取得
        
        // フェッチした動画の中から再生できるものを探す
        while (fetchedVideos.length > 0) {
            const candidate = fetchedVideos.shift();
            if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id) && !neverShowVideoIds.has(candidate.id)) {
                nextVideo = candidate;
                break;
            }
        }

        // それでも動画が見つからない場合は、最終手段として初期検索クエリで再度試すか、エラー表示
        if (!nextVideo) {
            console.warn("新しい動画をフェッチしましたが、再生可能な動画が見つかりませんでした。再度初期クエリで試します。");
            await fetchVideosFromYouTube(INITIAL_SEARCH_QUERY, 10); // 初期クエリで10件取得を試みる
            // 再度プールから取得を試みる
            while (videoPool.length > 0) {
                const candidate = videoPool.shift();
                if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id) && !neverShowVideoIds.has(candidate.id)) {
                    nextVideo = candidate;
                    break;
                }
            }
        }
        
        // 最終的に動画が見つからない場合の処理
        if (!nextVideo) {
            console.error("再生可能な動画が見つかりませんでした。");
            videoTitleElement.textContent = "動画が見つかりませんでした。";
            channelTitleElement.textContent = "";
            return; // これ以上処理を続行しない
        }
    }

    // ★修正点: playerの準備状態をここで再確認
    if (player && typeof player.loadVideoById === 'function' && nextVideo && nextVideo.id) {
        player.loadVideoById(nextVideo.id);
        playedVideoIds.add(nextVideo.id); // 再生した動画として追加
        saveUserData(); // データを保存
        displayCandidateVideos(); // 候補動画の表示を更新

        // 動画のタイトルとチャンネル名を表示
        videoTitleElement.textContent = nextVideo.title;
        channelTitleElement.textContent = nextVideo.channelTitle;

    } else {
        console.error("次の動画が見つからないか、プレイヤーが準備できていません。", nextVideo);
        videoTitleElement.textContent = "動画の読み込みに失敗しました";
        channelTitleElement.textContent = "チャンネル情報なし";
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
    // videoPoolはshiftで減るので、ここではコピーして使う
    const currentPool = Array.from(videoPool); 
    for (const video of currentPool) {
        if (video && video.id && !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) && !neverShowVideoIds.has(video.id) && !displayedIds.has(video.id)) {
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
            if (player && typeof player.loadVideoById === 'function') { // ★修正点: playerの準備状態をここで確認
                player.loadVideoById(video.id);
                playedVideoIds.add(video.id);
                // 再生したらプールから削除（または見たものとしてマーク）
                videoPool = videoPool.filter(v => v.id !== video.id); // クリック再生した動画をプールから削除
                saveUserData();
                displayCandidateVideos(); // 表示を更新
            } else {
                console.error("プレイヤーが準備できていないため、動画を再生できません。");
            }
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
        // 初回ロード時は、まずAPIで動画を検索し、そのIDを使う
        // lastPlayedVideoIdがあればそれを優先
        videoId: lastPlayedVideoId || 'initialLoadPlaceholder', // 後で実際に再生する動画IDに置き換えるためのプレースホルダー
        playerVars: {
            'autoplay': 1,
            'mute': 1,
            'controls': 1,
            'loop': 0,
            'rel': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError // エラーハンドリングを追加
        }
    });
}

// プレイヤーの準備が完了した時に呼ばれる関数
async function onPlayerReady(event) {
    console.log("YouTubeプレイヤーの準備ができました！");

    const lastPlayedVideoId = localStorage.getItem(currentPlayingVideoIdKey);

    if (lastPlayedVideoId && !playedVideoIds.has(lastPlayedVideoId) && !dislikedVideoIds.has(lastPlayedVideoId) && !neverShowVideoIds.has(lastPlayedVideoId)) {
        // 前回再生していた動画が有効で、かつ履歴になければそれを再生
        player.loadVideoById(lastPlayedVideoId);
        playedVideoIds.add(lastPlayedVideoId);
        // ここで動画データを取得してタイトル・チャンネル名を表示
        // ★修正点: getVideoDataの準備を待つ
        const checkVideoDataInterval = setInterval(() => {
            const videoData = player.getVideoData();
            if (videoData && videoData.title && videoData.author) {
                videoTitleElement.textContent = videoData.title;
                channelTitleElement.textContent = videoData.author;
                clearInterval(checkVideoDataInterval);
            }
        }, 100); // 100msごとにチェック

        saveUserData();
    } else {
        // 履歴がない、または履歴の動画が再生できない場合は、playNextVideoで新しい動画を探す
        console.log("初期動画または履歴の動画が見つからない、または再生できません。新しい動画を探します。");
        await playNextVideo();
    }

    event.target.playVideo(); // 動画再生を開始

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
        // ★修正点: getVideoDataの準備を待つ
        const checkVideoDataInterval = setInterval(() => {
            const videoData = player.getVideoData();
            if (videoData && videoData.title && videoData.author) {
                videoTitleElement.textContent = videoData.title;
                channelTitleElement.textContent = videoData.author;
                clearInterval(checkVideoDataInterval);
            }
        }, 100); // 100msごとにチェック
    }
}

// プレイヤーでエラーが発生した時の処理
function onPlayerError(event) {
    console.error("YouTubeプレイヤーでエラーが発生しました。コード:", event.data);
    // エラーコードに応じてメッセージを表示
    let errorMessage = "動画の読み込み中にエラーが発生しました。";
    switch (event.data) {
        case 2:
            errorMessage = "動画IDが正しくないか、動画が存在しません。";
            break;
        case 5:
            errorMessage = "HTML5プレイヤーのエラーです。";
            break;
        case 100:
            errorMessage = "動画が見つからないか、非公開です。";
            break;
        case 101:
        case 150:
            errorMessage = "埋め込みが許可されていないか、地域制限されています。";
            break;
    }
    videoTitleElement.textContent = errorMessage;
    channelTitleElement.textContent = "次の動画を自動で探します...";
    
    // エラーが発生した動画は「二度と表示しない」リストに追加して、次を探す
    // ★修正点: playerの準備状態をここで確認
    if (player && typeof player.getVideoData === 'function' && player.getVideoData() && player.getVideoData().video_id) {
        const currentVideoId = player.getVideoData().video_id;
        if (currentVideoId && !neverShowVideoIds.has(currentVideoId)) {
            neverShowVideoIds.add(currentVideoId);
            playedVideoIds.add(currentVideoId); // 念のため再生済みにも追加
            saveUserData();
        }
    }
    playNextVideo(); // 次の動画を再生
}


// スキップボタンが押された時の処理
document.getElementById('skipButton').addEventListener('click', function() {
    // ★修正点: playerの準備状態をここで確認
    if (player && typeof player.getVideoData === 'function') {
        const currentVideoId = player.getVideoData().video_id;
        if (currentVideoId && !dislikedVideoIds.has(currentVideoId)) { // 同じ動画を何度もスキップしないように
            dislikedVideoIds.add(currentVideoId); // スキップした動画として追加
            console.log("スキップボタンが押されました！動画ID:", currentVideoId);
            saveUserData(); // データを保存
            displayCandidateVideos(); // 候補動画の表示を更新
        }
    }
    playNextVideo(); // 次の動画を再生
});

// いいねボタンが押された時の処理
document.getElementById('likeButton').addEventListener('click', function() {
    // ★修正点: playerの準備状態をここで確認
    if (player && typeof player.getVideoData === 'function') {
        const currentVideoId = player.getVideoData().video_id;
        if (currentVideoId && !likedVideoIds.has(currentVideoId)) { // 同じ動画を何度もいいねしないように
            likedVideoIds.add(currentVideoId); // いいねした動画として追加
            console.log("いいねボタンが押されました！動画ID:", currentVideoId);
            saveUserData(); // データを保存
            // いいねしたからといってすぐに次の動画には進まない
        }
    }
});

// 「この動画を二度と表示しない」ボタンが押された時の処理
document.getElementById('neverShowButton').addEventListener('click', function() {
    // ★修正点: playerの準備状態をここで確認
    if (player && typeof player.getVideoData === 'function') {
        const currentVideoId = player.getVideoData().video_id;
        if (currentVideoId && !neverShowVideoIds.has(currentVideoId)) {
            neverShowVideoIds.add(currentVideoId); // 二度と表示しないリストに追加
            playedVideoIds.add(currentVideoId); // 再生済みにも追加し、プールからも除外されやすくする
            console.log("「この動画を二度と表示しない」ボタンが押されました！動画ID:", currentVideoId);
            alert('この動画は今後表示されなくなります。'); // ユーザーに通知
            saveUserData(); // データを保存
            displayCandidateVideos(); // 候補動画の表示を更新
        }
    }
    playNextVideo(); // 次の動画を再生
});

// ページを閉じる前にデータを保存する（ブラウザタブを閉じる、F5以外でページ遷移など）
window.addEventListener('beforeunload', saveUserData);