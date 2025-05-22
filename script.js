// YouTube IFrame Player APIを読み込むための準備
// このスクリプトはYouTubeの動画プレイヤーをウェブページに埋め込むために必要です。
var tag = document.createElement('script');
// ★★★ここを公式の安定したHTTPS URLに修正しました！★★★
tag.src = "https://www.youtube.com/iframe_api"; 
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// あなたのYouTube Data APIキーをここに貼り付けます。
const API_KEY = 'AIzaSyAtASunKOOifOJBvRctJ6o2ILa5D_JgaJw'; // ★★★ここをあなたのAPIキーに貼り付けてください！★★★

// ★ここから最初の動画と検索キーワードをカスタマイズ！★
const INITIAL_VIDEO_ID = 'dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up
const INITIAL_SEARCH_QUERY = '音楽'; // 初期に検索するキーワード (例: '人気動画', '旅行', '経済' など)
// ★ここまで★

// 動画プールと履歴を管理するための変数群
let videoPool = []; 
let playedVideoIds = new Set(); 
let likedVideoIds = new Set();  
let dislikedVideoIds = new Set(); 
const currentPlayingVideoIdKey = 'currentPlayingVideoId'; 
let currentSearchQuery = INITIAL_SEARCH_QUERY; 

// HTML要素への参照を取得
const videoTitleElement = document.getElementById('videoTitle');
const channelTitleElement = document.getElementById('channelTitle');

function saveUserData() {
    localStorage.setItem('playedVideoIds', JSON.stringify(Array.from(playedVideoIds)));
    localStorage.setItem('likedVideoIds', JSON.stringify(Array.from(likedVideoIds)));
    localStorage.setItem('dislikedVideoIds', JSON.stringify(Array.from(dislikedVideoIds)));
    
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
    return storedCurrentVideoId; 
}

async function fetchVideosFromYouTube(query = '', maxResults = 10) {
    let url;
    if (query) {
        url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}&order=relevance`;
    } else {
        url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&part=snippet,contentDetails&chart=mostPopular&regionCode=JP&maxResults=${maxResults}`;
    }

    try {
        const response = await fetch(url); 
        const data = await response.json(); 

        if (!data.items || !Array.isArray(data.items)) {
            console.warn("YouTube APIからのレスポンスに問題があります。itemsがありません。", data);
            return []; 
        }

        const newVideos = data.items.map(item => ({
            id: item.id.videoId || item.id, 
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url, 
            tags: item.snippet.tags || [], 
            channelTitle: item.snippet.channelTitle 
        })).filter(video =>
            video.id && !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id)
        );
        
        videoPool = videoPool.concat(newVideos); 
        const uniqueVideoIdsInPool = new Set(videoPool.map(v => v.id));
        videoPool = Array.from(uniqueVideoIdsInPool).map(id => videoPool.find(v => v.id === id));

        console.log("動画を検索し、プールに追加しました。現在のプールサイズ:", videoPool.length);
        displayCandidateVideos(); 
        return newVideos; 

    } catch (error) {
        console.error("YouTube APIでの動画検索中にエラーが発生しました:", error);
        return []; 
    }
}

async function generateSmartSearchQuery() {
    if (likedVideoIds.size === 0) {
        currentSearchQuery = INITIAL_SEARCH_QUERY;
        console.log("いいねした動画がないため、初期検索クエリを使用:", currentSearchQuery);
        return;
    }

    let allTags = []; 
    let channelTitles = new Set(); 
    const likedVideoIdsArray = Array.from(likedVideoIds);

    for (let i = 0; i < likedVideoIdsArray.length; i += 50) {
        const batchIds = likedVideoIdsArray.slice(i, i + 50);
        const url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&part=snippet&id=${batchIds.join(',')}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (!data.items || !Array.isArray(data.items)) {
                console.warn("タグ/チャンネル取得APIからのレスポンスに問題があります。itemsがありません。", data);
                continue; 
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

    const tagCounts = {};
    allTags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });

    const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
    const topTags = sortedTags.slice(0, 3); 

    let smartQueryParts = [];
    if (channelTitles.size > 0) {
        smartQueryParts = Array.from(channelTitles).slice(0, 2); 
        smartQueryParts = smartQueryParts.concat(topTags.slice(0, 3 - smartQueryParts.length));
    } else {
        smartQueryParts = topTags;
    }

    if (smartQueryParts.length > 0) {
        currentSearchQuery = smartQueryParts.join(' ');
        console.log("いいねした動画から生成された検索クエリ:", currentSearchQuery);
    } else {
        currentSearchQuery = INITIAL_SEARCH_QUERY;
        console.log("いいねした動画から適切な検索クエリを生成できませんでした。初期検索クエリに戻します:", currentSearchQuery);
    }
}

async function playNextVideo() {
    let nextVideo = null;

    while (videoPool.length > 0) {
        const candidate = videoPool.shift(); 
        if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id)) {
            nextVideo = candidate; 
            break;
        }
    }

    if (!nextVideo) {
        console.log("動画プールが空です。新しい動画を検索します。");
        await generateSmartSearchQuery(); 
        const fetchedVideos = await fetchVideosFromYouTube(currentSearchQuery, 20); 

        for (const candidate of fetchedVideos) { 
            if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id)) {
                nextVideo = candidate; 
                break;
            }
        }

        if (!nextVideo) {
            console.warn("新しい動画をフェッチしましたが、再生可能な動画が見つかりませんでした。再度初期クエリで試します。");
            await fetchVideosFromYouTube(INITIAL_SEARCH_QUERY, 10); 
            while (videoPool.length > 0) {
                const candidate = videoPool.shift();
                if (candidate && candidate.id && !playedVideoIds.has(candidate.id) && !dislikedVideoIds.has(candidate.id)) {
                    nextVideo = candidate;
                    break;
                }
            }
        }
    }

    if (!nextVideo) {
        console.error("再生可能な動画が見つかりませんでした。");
        if (videoTitleElement) videoTitleElement.textContent = "動画が見つかりませんでした。";
        if (channelTitleElement) channelTitleElement.textContent = "検索キーワードを変更してみてください。";
        return; 
    }

    if (player && typeof player.loadVideoById === 'function' && nextVideo && nextVideo.id) {
        player.loadVideoById(nextVideo.id); 
        playedVideoIds.add(nextVideo.id); 
        saveUserData(); 
        displayCandidateVideos(); 

        if (videoTitleElement) videoTitleElement.textContent = nextVideo.title;
        if (channelTitleElement) channelTitleElement.textContent = nextVideo.channelTitle;

    } else {
        console.error("次の動画が見つからないか、プレイヤーが準備できていません。", nextVideo);
        if (videoTitleElement) videoTitleElement.textContent = "動画の読み込みに失敗しました";
        if (channelTitleElement) channelTitleElement.textContent = "チャンネル情報なし";
    }
}

function displayCandidateVideos() {
    const candidateContainer = document.getElementById('候補動画を表示する場所'); 
    if (!candidateContainer) {
        console.warn("ID '候補動画を表示する場所' を持つ要素が見つかりませんでした。");
        return;
    }
    candidateContainer.innerHTML = ''; 

    const uniqueCandidates = [];
    const displayedIds = new Set();
    const currentPool = Array.from(videoPool); 
    for (const video of currentPool) {
        if (video && video.id && !playedVideoIds.has(video.id) && !dislikedVideoIds.has(video.id) && !displayedIds.has(video.id)) {
            uniqueCandidates.push(video);
            displayedIds.add(video.id);
        }
        if (uniqueCandidates.length >= 6) break; 
    }

    uniqueCandidates.forEach(video => {
        const videoDiv = document.createElement('div');
        videoDiv.className = 'video-candidate'; 
        videoDiv.dataset.videoId = video.id; 

        videoDiv.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}" class="rounded-md">
            <div class="video-candidate-title text-sm font-medium mt-1">${video.title}</div>
            <div class="video-candidate-channel text-xs text-gray-500">${video.channelTitle || 'チャンネル不明'}</div>
        `;
        
        videoDiv.addEventListener('click', () => {
            if (player && typeof player.loadVideoById === 'function') { 
                player.loadVideoById(video.id); 
                playedVideoIds.add(video.id); 
                videoPool = videoPool.filter(v => v.id !== video.id); 
                saveUserData(); 
                displayCandidateVideos(); 
            } else {
                console.error("プレイヤーが準備できていないため、動画を再生できません。");
            }
        });

        candidateContainer.appendChild(videoDiv); 
    });
}

var player;

function onYouTubeIframeAPIReady() {
    const lastPlayedVideoId = loadUserData(); 

    player = new YT.Player('player', { 
        height: '390', 
        width: '640',  
        videoId: lastPlayedVideoId || INITIAL_VIDEO_ID, 
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
            'onError': onPlayerError       
        }
    });
}

async function onPlayerReady(event) {
    console.log("YouTubeプレイヤーの準備ができました！");

    const lastPlayedVideoId = localStorage.getItem(currentPlayingVideoIdKey);

    if (lastPlayedVideoId && !playedVideoIds.has(lastPlayedVideoId) && !dislikedVideoIds.has(lastPlayedVideoId)) {
        player.loadVideoById(lastPlayedVideoId); 
        playedVideoIds.add(lastPlayedVideoId); 
        const checkVideoDataInterval = setInterval(() => {
            const videoData = player.getVideoData();
            if (videoData && videoData.title && videoData.author) {
                if (videoTitleElement) videoTitleElement.textContent = videoData.title;
                if (channelTitleElement) channelTitleElement.textContent = videoData.author;
                clearInterval(checkVideoDataInterval); 
            }
        }, 100); 

        saveUserData(); 
    } else {
        console.log("初期動画または履歴の動画が見つからない、または再生できません。新しい動画を探します。");
        await playNextVideo(); 
    }

    event.target.playVideo(); 

    await generateSmartSearchQuery(); 
    if (videoPool.length < 5) { 
        fetchVideosFromYouTube(currentSearchQuery, 20); 
    }
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.ENDED) {
        console.log("動画の再生が終わりました。次の動画を探します...");
        playNextVideo(); 
    } else if (event.data == YT.PlayerState.PLAYING) {
        const checkVideoDataInterval = setInterval(() => {
            const videoData = player.getVideoData();
            if (videoData && videoData.title && videoData.author) {
                if (videoTitleElement) videoTitleElement.textContent = videoData.title;
                if (channelTitleElement) channelTitleElement.textContent = videoData.author;
                clearInterval(checkVideoDataInterval);
            }
        }, 100); 
    }
}

function onPlayerError(event) {
    console.error("YouTubeプレイヤーでエラーが発生しました。コード:", event.data);
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
    if (videoTitleElement) videoTitleElement.textContent = errorMessage;
    if (channelTitleElement) channelTitleElement.textContent = "次の動画を自動で探します...";
    
    playNextVideo(); 
}

// --- ボタンイベントリスナー ---

document.getElementById('skipButton').addEventListener('click', function() {
    if (player && typeof player.getVideoData === 'function') {
        const currentVideoId = player.getVideoData().video_id;
        if (currentVideoId && !dislikedVideoIds.has(currentVideoId)) { 
            dislikedVideoIds.add(currentVideoId); 
            console.log("スキップボタンが押されました！動画ID:", currentVideoId);
            saveUserData(); 
            displayCandidateVideos(); 
        }
    }
    playNextVideo(); 
});

document.getElementById('likeButton').addEventListener('click', function() {
    if (player && typeof player.getVideoData === 'function') {
        const currentVideoId = player.getVideoData().video_id;
        if (currentVideoId && !likedVideoIds.has(currentVideoId)) { 
            likedVideoIds.add(currentVideoId); 
            console.log("いいねボタンが押されました！動画ID:", currentVideoId);
            saveUserData(); 
        }
    }
});

window.addEventListener('beforeunload', saveUserData);