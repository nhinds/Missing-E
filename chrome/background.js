/*
 * 'Missing e' Extension
 *
 * Copyright 2012, Jeremy Cutler
 * Released under the GPL version 3 licence.
 * SEE: license/GPL-LICENSE.txt
 *
 * This file is part of 'Missing e'.
 *
 * 'Missing e' is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * 'Missing e' is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with 'Missing e'. If not, see <http://www.gnu.org/licenses/>.
 */

var currVersion;
var maxActiveAjax = 15;
var activeAjax = 0;
var activeRequests = {};
var waitQueue = [];
var onHold = {};
var numSleeping = 0;
var cache = {};
var cacheElements = 0;
var cacheClear;
var clearQueues;
var permissionCache = {};
var askerTable = {};
var askerWaiters = {};
var askerTableCopy = {};
var askerTableClear;
var fiveMinutes = 300000;
var tenSeconds = 10000;
var tabs = {};
var replies = {};
var crushes = {};
var repliesAndCrushesClear;
var lang = 'en';

function getSetting(key, defVal) {
   var retval = localStorage[key];
   if (retval === undefined || retval === null || retval === "") {
      return defVal;
   }
   else {
      if (/[^\d]/.test(retval)) {
         return retval;
      }
      else {
         return parseInt(retval, 10);
      }
   }
}

function setSetting(key, val) {
   localStorage[key] = val;
}

function getVersion() {
   var xhr = new XMLHttpRequest();
   xhr.open('GET', chrome.extension.getURL('manifest.json'), false);
   xhr.send(null);
   var manifest = JSON.parse(xhr.responseText);
   return manifest.version;
}

function addTab(id, url) {
   var d = (new Date()).valueOf();
   tabs[id] = d;
   MissingE.debug("Adding tab (" + id + ") " + d);
}

chrome.tabs.onRemoved.addListener(function(id, removeInfo) {
   if (tabs[id]) {
      delete tabs[id];
      MissingE.debug("Removing tab (" + id + ")");
   }
});

repliesAndCrushesClear = setInterval(function() {
   var i;
   for (i in replies) {
      if (replies.hasOwnProperty(i)) {
         if (!tabs.hasOwnProperty(i)) {
            delete replies[i];
         }
      }
   }
   for (i in crushes) {
      if (crushes.hasOwnProperty(i)) {
         if (!tabs.hasOwnProperty(i)) {
            delete crushes[i];
         }
      }
   }
}, fiveMinutes);

askerTableClear = setInterval(function() {
   var i;
   for (i in askerTableCopy) {
      if (askerTableCopy.hasOwnProperty(i) &&
          askerTable.hasOwnProperty(i)) {
         delete askerTable[i];
      }
   }
   askerTableCopy = {};
   for (i in askerTable) {
      if (askerTable.hasOwnProperty(i)) {
         askerTableCopy[i] = true;
      }
   }
}, fiveMinutes);

cacheClear = setInterval(function() {
   cache = {};
   cacheElements = 0;
   permissionCache = {};
}, fiveMinutes);

clearQueues = setInterval(function() {
   if (activeAjax == 0) {
      if (numSleeping !== 0) {
         MissingE.debug(numSleeping + " still sleeping");
      }
      if (waitQueue.length > 0) {
         MissingE.debug(waitQueue.length + " still queued");
      }
   }
}, tenSeconds);

function closeTab(url, currentId) {
   chrome.windows.getAll({populate: true}, function (windows) {
      var i,j;
      for (i=0; i<windows.length; i++) {
         for (j=0; j<windows[i].tabs.length; j++) {
            var thisURL = windows[i].tabs[j].url.replace(/#.*$/,'');
            if (thisURL == url &&
                windows[i].tabs[j].id != currentId) {
               chrome.tabs.remove(windows[i].tabs[j].id);
            }
         }
      }
   });
}

function isInternalSetting(setting) {
   return !/^MissingE_/.test(setting) ||
          setting === "MissingE_version" ||
          setting === "MissingE_previousVersion" ||
          /MissingE_externalVersion/.test(setting) ||
          setting === "MissingE_compatCheck" ||
          setting === "MissingE_lastUpdateCheck" ||
          setting === "MissingE_konami_active" ||
          !/^\w*$/.test(setting);
}

function createOptionParams() {
   var opts = {};
   for (setting in localStorage) {
      if (localStorage.hasOwnProperty(setting) &&
          !isInternalSetting(setting)) {
         opts[setting] = localStorage[setting];
      }
   }
   return opts;
}

function createOptionString() {
   var i, result = "";
   var opts = createOptionParams();
   for (i in opts) {
      if (opts.hasOwnProperty(i)) {
         result += i + ": \"" + opts[i] + "\"\n";
      }
   }
   return result;
}

function receiveOptions(request, sendResponse) {
   var changed, set, reset;
   changed = set = reset = 0;
   var settings = request.data;
   for (i in settings) {
      if (settings.hasOwnProperty(i)) {
         if (!localStorage.hasOwnProperty(i) ||
             localStorage[i] !== settings[i]) {
            var old = "'" + localStorage[i] + "'";
            if (localStorage[i] === undefined) {
               old = "undefined";
               set++;
            }
            else {
               changed++;
            }
            MissingE.debug(i + " [" + old + " => '" +
                        settings[i] + "']");
            localStorage[i] = settings[i];
         }
      }
   }
   for (i in localStorage) {
      if (localStorage.hasOwnProperty(i) &&
          !settings.hasOwnProperty(i) &&
          !isInternalSetting(i)) {
         reset++;
         localStorage.removeItem(i);
      }
   }
   if (set + changed + reset > 0) {
      fixupSettings();
      alert("Import complete.\n\n" + (set+changed+reset) + " change(s) made.");
      sendResponse({greeting:"importOptions", success:true});
   }
   else {
      alert("No changes imported.");
      sendResponse({greeting:"importOptions", success:false});
   }
}

function doTags(stamp, id, sendResponse) {
   if (!stamp.tags) {
      MissingE.debug("Cache entry does not have tags");
      return false;
   }
   var tags = stamp.tags;
   if (!tags) {
      tags = [];
   }
   sendResponse({success: true, data: tags});
   return true;
}

function doVimeoPreview(stamp, id, sendResponse) {
   var failMsg = {success: true, pid: id,
                  data: [chrome.extension.getURL('core/dashboardTweaks/black.png')],
                  type: "video"};
   if (!stamp.videoThumbs ||
       stamp.videoThumbs.length !== 1 ||
       !/vimeo:/.test(stamp.videoThumbs[0])) {
      sendResponse(failMsg);
      return true;
   }

   var vimeoId = stamp.videoThumbs[0].match(/vimeo:(.*)/)[1];
   $.ajax({
      type: "GET",
      url: "http://vimeo.com/api/v2/video/" + vimeoId + ".json",
      dataType: "json",
      targetId: id,
      error: function(xhr, textStatus) {
         if (xhr.status == 404) {
            MissingE.debug("vimeo request (" + this.targetId + ") not found");
            sendResponse(failMsg);
            return;
         }
         else {
            MissingE.debug("vimeo request (" + this.targetId + ") failed");
            sendResponse(failMsg);
            return;
         }
      },
      success: function(data, textStatus) {
         var theEntry, isNew;
         if (data && data.length > 0) {
            data = data[0];
         }
         if (!data.hasOwnProperty("thumbnail_small")) {
            sendResponse(failMsg);
            return;
         }
         if ((theEntry = cache[id])) {
            MissingE.debug("Saving vimeo thumb " + id + " to cache (HIT)");
            isNew = false;
         }
         else {
            MissingE.debug("Saving vimeo thumb " + id + " to cache (MISS)");
            cacheElements++;
            theEntry = {};
            isNew = false;
         }
         theEntry.videoThumbs = [data.thumbnail_small];
         if (isNew) {
            cache[id] = theEntry;
         }
         sendResponse({success: true, pid: id,
                       data: [data.thumbnail_small], type: "video"});
         return;
      }
   });
}

function doNotes(count, id, sendResponse) {
   sendResponse({success: true, pid: id, data: count});
   return true;
}

function doPreview(stamp, id, sendResponse) {
   var i, type;
   if (!stamp.photos && !stamp.videoThumbs) {
      MissingE.debug("Cache entry does not have photos");
      return false;
   }
   if (stamp.photos) { type = "photo"; }
   else if (stamp.videoThumbs) { type = "video"; }
   var photos = [];
   for (i=0; stamp.photos && i<stamp.photos.length; i++) {
      photos.push(stamp.photos[i].replace(/\d+\.([a-z]+)$/,"100.$1"));
   }
   for (i=0; stamp.videoThumbs && i<stamp.videoThumbs.length; i++) {
      photos.push(stamp.videoThumbs[i]);
   }
   if (photos.length === 0) {
      photos.push(chrome.extension.getURL('core/dashboardTweaks/black.png'));
   }
   if (/vimeo:/.test(photos[0])) {
      MissingE.debug("Preview image is " + photos[0] + ". Accessing Vimeo API.");
      doVimeoPreview(stamp, id, sendResponse);
      return true;
   }
   else {
      sendResponse({success: true, pid: id, data: photos, type: type});
      return true;
   }
}

function doTimestamp(stamp, id, sendResponse) {
   if (!stamp.timestamp) {
      MissingE.debug("Cache entry does not have timestamp");
      return false;
   }
   var ts = stamp.timestamp;
   var d = new Date(ts*1000);
   if (isNaN(d)) {
      sendResponse({pid: id, success: false});
   }
   var ins = getSetting("MissingE_timestamps_format",MissingE.defaultFormat);
   ins = MissingE.getFormattedDate(d, ins, lang);
   ins = ins.replace(/%X/g,id);
   sendResponse({pid: id, success: true, data: ins});
   return true;
}

function doReblogDash(stamp, id, sendResponse) {
   if (!stamp.reblog_key) {
      MissingE.debug("Cache entry does not have reblog key.");
      return false;
   }
   var key = stamp.reblog_key;
   var name = stamp.name;
   sendResponse({pid: id, success: true, data: key, name: name});
   return true;
}

function queueAjax(details) {
   waitQueue.push(details);
   MissingE.debug("Queueing " + details.type + " request. " + (waitQueue.length) + " in queue");
}

function dequeueAjax(id) {
   if (id) {
      activeAjax--;
      wakeById(id);
      delete activeRequests[id];
   }
   while (activeAjax < maxActiveAjax) {
      var call = waitQueue.shift();
      if (!call) { return false; }
      MissingE.debug("Dequeueing " + call.type + " request. " + (waitQueue.length) + " in queue");
      runItem(call);
   }
}

function saveCache(id, entry) {
   var theEntry;
   var isNew = true;
   if ((theEntry = cache[id])) {
      MissingE.debug("Saving " + id + " to cache (HIT)");
      isNew = false;
   }
   else {
      MissingE.debug("Saving " + id + " to cache (MISS)");
      cacheElements++;
      theEntry = {};
   }
   for (var i in entry) {
      if (entry.hasOwnProperty(i)) {
         if (i == "photos" ||
             i == "timestamp" ||
             i == "reblog_key" ||
             i == "post_url" ||
             i == "tags" ||
             i == "type" ||
             i == "publishStamp" ||
             (i == "name" && entry[i] != "")) {
            theEntry[i] = entry[i];
         }
         else if (i == "videoThumbs" &&
                  !theEntry.hasOwnProperty(i)) {
            theEntry[i] = entry[i];
         }
      }
   }
   if (isNew) {
      cache[id] = theEntry;
   }
}

function cacheServe(type, id, sendResponse, fn, midFlight, notAjax) {
   var entry;
   if ((entry = cache[id])) {
      MissingE.debug(type + " request (" + id + ") has cache entry.");
      if (midFlight && !notAjax) {
         dequeueAjax(id);
      }
      else if (!notAjax) {
         dequeueAjax();
      }
      return fn(entry, id, sendResponse);
   }
   else {
      return false;
   }
}

function runItem(call) {
   if (call.type === "reblogYourself") {
      requestReblogYourself(call.request, call.sender, call.sendResponse, call.hash);
   }
   else if (call.type === "betterReblogs") {
      requestBetterReblogsAsk(call.request, call.sender, call.sendResponse, call.hash);
   }
   else if (call.type === "timestamp") {
      requestTimestamp(call.request, call.sender, call.sendResponse, call.hash);
   }
   else if (call.type === "tags") {
      requestTags(call.request, call.sender, call.sendResponse, call.hash);
   }
   else if (call.type === "preview") {
      requestPreview(call.request, call.sender, call.sendResponse, call.hash);
   }
   else if (call.type === "notes") {
      requestNotes(call.request, call.sender, call.sendResponse, call.hash);
   }
}

function wakeById(id) {
   var i,j;
   for (i=0; activeRequests[id] && i<activeRequests[id].length; i++) {
      var call;
      if ((call = activeRequests[id][i])) {
         delete onHold[call.type + call.request.pid];
         numSleeping--;
         MissingE.debug("Selectively waking " + call.type + " request (" + call.request.pid + "). " + numSleeping + " still asleep");
         runItem(call);
      }
   }
}

function isRequested(details) {
   var bucket;
   if (!details.request.sleepCount) {
      details.request.sleepCount = 0;
   }
   if ((bucket = activeRequests[details.request.pid]) &&
       details.request.sleepCount < 5) {
      onHold[details.type + details.request.pid] = details;
      bucket.push(details);
      numSleeping++;
      details.request.sleepCount++;
      MissingE.debug("Sleeping " + details.type + " request (" + details.request.pid +
            ") [" + details.request.sleepCount + "]. " + numSleeping +
            " asleep");
      return true;
   }
   else {
      return false;
   }
}

function startAjax(id) {
   activeAjax++;
   if (!activeRequests.hasOwnProperty(id)) {
      activeRequests[id] = [];
   }
}

function doAskAjax(request, sender, sendResponse, hash, retries, type, doFunc) {
   MissingE.debug("AJAX " + type + " request (" + request.pid + ")");
   startAjax(request.pid);
   var failMsg = {greeting:type, success:false, pid:request.pid};
   $.ajax({
      type: "GET",
      url: request.url + request.pid,
      dataType: "html",
      tryCount: 0,
      retryLimit: retries,
      targetId: request.pid,
      tabId: sender.tab.id,
      tabHash: hash,
      error: function(xhr, textStatus) {
         if (xhr.status == 404) {
            MissingE.debug(type + " request (" + this.targetId + ") not found");
            dequeueAjax(this.targetId);
            sendResponse(failMsg);
            return;
         }
         if (this.tabHash !== tabs[this.tabId]) {
            MissingE.debug("Stop " + type + " request: Tab closed or changed.");
            dequeueAjax(this.targetId);
            return;
         }
         if (cacheServe(type, request.pid, sendResponse, doFunc, true)) {
            return true;
         }
         else {
            this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
               MissingE.debug("Retry " + type + " request (" + this.targetId + ")");
               $.ajax(this);
               return;
            }
            else {
               MissingE.debug(type + " request (" + this.targetId + ") failed");
               dequeueAjax(this.targetId);
               sendResponse(failMsg);
            }
         }
      },
      success: function(data, textStatus) {
         var closed = (this.tabHash !== tabs[this.tabId]);
         if (!(/<input[^>]*name="post\[date\]"[^>]*>/.test(data))) {
            if (closed) {
               MissingE.debug("Stop " + type + " request: Tab closed or changed.");
               dequeueAjax(this.targetId);
               return;
            }
            if (cacheServe(type, request.pid, sendResponse, doFunc, true)) {
               return true;
            }
            else {
               this.tryCount++;
               if (this.tryCount <= this.retryLimit) {
                  MissingE.debug("Retry " + type + " request (" + this.targetId + ")");
                  $.ajax(this);
                  return;
               }
               else {
                  MissingE.debug(type + " request (" + this.targetId + ") failed");
                  dequeueAjax(this.targetId);
                  sendResponse(failMsg);
               }
            }
         }
         else {
            var failed = false;
            var txt;
            var inp = data.match(/<input[^>]*name="post\[date\]"[^>]*>/);
            if (!inp) { failed = true; }
            else {
               txt = inp[0].match(/value="([^"]*)"/);
               if (!txt || txt.length < 2) {
                  failed = true;
               }
               else {
                  txt = txt[1];
               }
            }
            if (failed) {
               MissingE.debug(type + " request (" + this.targetId + ") failed");
               dequeueAjax(this.targetId);
               sendResponse(failMsg);
               return;
            }

            var stamp = MissingE.buildTimestamp(txt);

            var info = {"timestamp":stamp};
            saveCache(this.targetId, info);
            dequeueAjax(this.targetId);
            if (!closed) {
               doFunc(info, this.targetId, sendResponse);
            }
         }
      }
   });
}

function checkPermission(request, sender, sendResponse, hash, retries, tryCount) {
   if (permissionCache.hasOwnProperty(request.user)) {
      sendResponse({allow: permissionCache[request.user]});
      return;
   }
   var ajax = new XMLHttpRequest();
   ajax.open("HEAD", "http://www.tumblr.com/blog/" + request.user, true);
   ajax.tabHash = hash;
   ajax.tabId = sender.tab.id;
   if (!tryCount) { tryCount = 0; }
   ajax.onreadystatechange = function() {
      if (this.tabHash !== tabs[this.tabId]) {
         return;
      }
      else if (this.readyState == 4) {
         if (this.status == 200) {
            permissionCache[request.user] = true;
            sendResponse({allow: true});
         }
         else if (this.status < 500) {
            permissionCache[request.user] = false;
            sendResponse({allow:false});
         }
         else {
            tryCount++;
            if (tryCount <= retries) {
               checkPermission(request, sender, sendResponse, hash, retries,
                               tryCount);
               return;
            }
            else {
               sendResponse({allow:false});
            }
         }
      }
   };
   ajax.send();
}

function parseRSS(data, forceType) {
   var info = {};
   var i;
   var tags = data.match(/<category>[^<]*<\/category>/g);
   if (!tags) { tags = []; }
   for (i=0; i<tags.length; i++) {
      tags[i] = tags[i].replace(/^<category>/,'')
                     .replace(/<\/category>$/,'');
   }
   info.tags = tags;

   var pubTime = data.match(/<pubDate>([^<]*)<\/pubDate>/);
   if (pubTime && pubTime.length > 1) {
      info.publishStamp = (new Date(pubTime[1])).valueOf()/1000;
   }

   var photos = [];
   var desc = data.match(/<description>&lt;img[^<]*/);
   if (desc) {
      desc = desc[0].replace(/^<description>/,'');
      while (/^&lt;img/.test(desc)) {
         var img = desc.match(/src="([^"]*)"/);
         if (img && img.length > 1) {
            photos.push(img[1].replace(/http:\/\/[0-9]+\./,'http://'));
         }
         desc = desc.replace(/^&lt;img[^&]*(&gt;|[^&]+)+/,'');
         desc = desc.replace(/^(&lt;br\/&gt;|\s)+/,'');
      }
   }
   if (photos.length > 0) {
      info.photos = photos;
   }

   var videoThumbs = [];
   var youtube = data.match(/<description>&lt;iframe[^&]*src="http:\/\/www\.youtube\.com\/embed\/([^\/\?]*)/);
   var vimeo = data.match(/<description>&lt;iframe[^&]*src="http:\/\/player.vimeo.com\/video\/([^\/\?"'%]*)/);
   var tumblr;
   if (/<description>&lt;span id="video_player/.test(data)) {
      tumblr = data.match(/poster=(http[^'"\(\)&]*)/);
      tumblr = tumblr[0].replace(/poster=/,'').split(',');
   }
   if (youtube && youtube.length > 1) {
      for (i=0; i<=3; i++) {
         videoThumbs.push('http://img.youtube.com/vi/' + youtube[1] + '/' +
                               i + '.jpg');
      }
   }
   else if (vimeo && vimeo.length > 1) {
      videoThumbs.push('vimeo:' + vimeo[1]);
   }
   else if (tumblr && tumblr.length > 1) {
      for (i=1; i<tumblr.length; i++) {
         videoThumbs.push(tumblr[i].replace(/%3A/gi,':').replace(/%2F/gi,'/'));
      }
   }
   if (videoThumbs.length > 0 || forceType === "video") {
      info.videoThumbs = videoThumbs;
   }

   return info;
}

function doTagsAjax(request, sender, sendResponse, hash, retries) {
   MissingE.debug("AJAX tags request (" + request.pid + ")");
   startAjax(request.pid);
   var failMsg = {greeting:"tags", success:false, pid:request.pid};
   $.ajax({
      type: "GET",
      url: request.url + "/post/" + request.pid + "/rss",
      dataType: "html",
      tryCount: 0,
      retryLimit: retries,
      targetId: request.pid,
      tabId: sender.tab.id,
      tabHash: hash,
      error: function(xhr, textStatus) {
         if (xhr.status === 404) {
            MissingE.debug("tags request (" + this.targetId + ") not found");
            dequeueAjax(this.targetId);
            sendResponse(failMsg);
            return;
         }
         if (this.tabHash !== tabs[this.tabId]) {
            MissingE.debug("Stop tags request: Tab closed or changed.");
            dequeueAjax(this.targetId);
            return;
         }
         if (cacheServe("tags", request.pid, sendResponse, doTags, true)) {
            return true;
         }
         else {
            this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
               MissingE.debug("Retry tags request (" + this.targetId + ")");
               $.ajax(this);
               return;
            }
            else {
               MissingE.debug("tags request (" + this.targetId + ") failed");
               dequeueAjax(this.targetId);
               sendResponse(failMsg);
            }
         }
      },
      success: function(data, textStatus) {
         var closed = (this.tabHash !== tabs[this.tabId]);
         if (!(/<guid>[^<]*<\/guid>/.test(data))) {
            if (closed) {
               MissingE.debug("Stop tags request: Tab closed or changed.");
               dequeueAjax(this.targetId);
               return;
            }
            if (cacheServe("tags", request.pid, sendResponse, doTags, true)) {
               return true;
            }
            else {
               this.tryCount++;
               if (this.tryCount <= this.retryLimit) {
                  MissingE.debug("Retry tags request (" + this.targetId + ")");
                  $.ajax(this);
                  return;
               }
               else {
                  MissingE.debug("tags request (" + this.targetId + ") failed");
                  dequeueAjax(this.targetId);
                  sendResponse(failMsg);
               }
            }
         }
         else {
            var info = parseRSS(data);
            saveCache(this.targetId, info);
            dequeueAjax(this.targetId);
            if (!closed) {
               doTags(info, this.targetId, sendResponse);
            }
         }
      }
   });
}

function doNotesAjaxMultiStep(request, sender, sendResponse, hash, retries) {
   MissingE.debug("AJAX notes 1st request (" + request.pid + ")");
   startAjax(request.pid);
   var failMsg = {greeting:"notes", success:false, pid:request.pid};
   $.ajax({
      type: "GET",
      url: request.url + "/post/" + request.pid + "/rss",
      dataType: "html",
      tryCount: 0,
      retryLimit: retries,
      targetId: request.pid,
      tabId: sender.tab.id,
      tabHash: hash,
      error: function(xhr, textStatus) {
         if (xhr.status === 404) {
            MissingE.debug("notes 1st request (" + this.targetId + ") not found");
            dequeueAjax(this.targetId);
            sendResponse(failMsg);
            return;
         }
         if (this.tabHash !== tabs[this.tabId]) {
            MissingE.debug("Stop notes 1st request: Tab closed or changed.");
            dequeueAjax(this.targetId);
            return;
         }
         if (!cacheServe("notes 1st", request.pid, null,
                         function(){return true;}, true)) {
            this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
               MissingE.debug("Retry notes 1st request (" + this.targetId + ")");
               $.ajax(this);
               return;
            }
            else {
               MissingE.debug("notes 1st request (" + this.targetId + ") failed");
               dequeueAjax(this.targetId);
               sendResponse(failMsg);
            }
         }
      },
      success: function(data, textStatus) {
         var closed = (this.tabHash !== tabs[this.tabId]);
         if (!(/<guid>[^<]*<\/guid>/.test(data))) {
            if (closed) {
               MissingE.debug("Stop notes 1st request: Tab closed or changed.");
               dequeueAjax(this.targetId);
               return;
            }
            if (!cacheServe("notes 1st", request.pid, null,
                            function(){return true;}, true)) {
               this.tryCount++;
               if (this.tryCount <= this.retryLimit) {
                  MissingE.debug("Retry notes 1st request (" + this.targetId + ")");
                  $.ajax(this);
                  return;
               }
               else {
                  MissingE.debug("notes 1st request (" + this.targetId + ") failed");
                  dequeueAjax(this.targetId);
                  sendResponse(failMsg);
               }
            }
         }
         else {
            var info = parseRSS(data);
            saveCache(this.targetId, info);
            dequeueAjax(this.targetId);
            if (!closed) {
               doNotesAjax(request, sender, sendResponse, hash, retries);
            }
         }
      }
   });
}

function doNotesAjax(request, sender, sendResponse, hash, retries) {
   if (!cache.hasOwnProperty(request.pid) ||
       !cache[request.pid].hasOwnProperty("publishStamp")) {
      doNotesAjaxMultiStep(request, sender, sendResponse, hash, retries);
      return;
   }
   MissingE.debug("AJAX notes request (" + request.pid + ")");
   startAjax(request.pid);
   var failMsg = {greeting:"notes", success:false, pid:request.pid};
   $.ajax({
      type: "GET",
      url: request.url + "/archive?before_time=" +
            (cache[request.pid].publishStamp+1),
      dataType: "html",
      tryCount: 0,
      retryLimit: retries,
      targetId: request.pid,
      tabId: sender.tab.id,
      tabHash: hash,
      error: function(xhr, textStatus) {
         if (xhr.status === 404) {
            MissingE.debug("notes request (" + this.targetId + ") not found");
            dequeueAjax(this.targetId);
            sendResponse(failMsg);
            return;
         }
         if (this.tabHash !== tabs[this.tabId]) {
            MissingE.debug("Stop notes request: Tab closed or changed.");
            dequeueAjax(this.targetId);
            return;
         }
         this.tryCount++;
         if (this.tryCount <= this.retryLimit) {
            MissingE.debug("Retry notes request (" + this.targetId + ")");
            $.ajax(this);
            return;
         }
         else {
            MissingE.debug("notes request (" + this.targetId + ") failed");
            dequeueAjax(this.targetId);
            sendResponse(failMsg);
         }
      },
      success: function(data, textStatus) {
         var closed = (this.tabHash !== tabs[this.tabId]);
         data = data.replace(/\n/g,' ');
         var re = new RegExp('< *a [^>]*id="post_' + this.targetId + '".*<\/a>');
         var postInfo = re.exec(data);
         if (!postInfo) {
            if (closed) {
               MissingE.debug("Stop notes request: Tab closed or changed.");
               dequeueAjax(this.targetId);
               return;
            }
            this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
               MissingE.debug("Retry notes request (" + this.targetId + ")");
               $.ajax(this);
               return;
            }
            else {
               MissingE.debug("notes request (" + this.targetId + ") failed");
               dequeueAjax(this.targetId);
               sendResponse(failMsg);
            }
         }
         else {
            var noteCount = postInfo[0].match(/<\s*div\s+class="notes"\s*>[^<\d]*([\d\., ]+)[^<\d]*/);
            if (!noteCount || noteCount.length < 2) {
               noteCount = "";
            }
            else {
               noteCount = noteCount[1];
            }
            noteCount = noteCount.replace(/^\s+/,'').replace(/\s+$/,'').replace(/\s/g,',');
            dequeueAjax(this.targetId);
            if (!closed) {
               doNotes(noteCount, this.targetId, sendResponse);
            }
         }
      }
   });
}

function doPreviewAjax(request, sender, sendResponse, hash, retries) {
   MissingE.debug("AJAX preview request (" + request.pid + ")");
   startAjax(request.pid);
   var failMsg = {greeting:"preview", success:false, pid:request.pid};
   $.ajax({
      type: "GET",
      url: request.url + "/post/" + request.pid + "/rss",
      dataType: "html",
      tryCount: 0,
      retryLimit: retries,
      targetId: request.pid,
      tabId: sender.tab.id,
      tabHash: hash,
      error: function(xhr, textStatus) {
         if (xhr.status === 404) {
            MissingE.debug("preview request (" + this.targetId + ") not found");
            dequeueAjax(this.targetId);
            sendResponse(failMsg);
            return;
         }
         if (this.tabHash !== tabs[this.tabId]) {
            MissingE.debug("Stop preview request: Tab closed or changed.");
            dequeueAjax(this.targetId);
            return;
         }
         if (cacheServe("preview", request.pid, sendResponse, doPreview, true)) {
            return true;
         }
         else {
            this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
               MissingE.debug("Retry preview request (" + this.targetId + ")");
               $.ajax(this);
               return;
            }
            else {
               MissingE.debug("preview request (" + this.targetId + ") failed");
               dequeueAjax(this.targetId);
               sendResponse(failMsg);
            }
         }
      },
      success: function(data, textStatus) {
         var closed = (this.tabHash !== tabs[this.tabId]);
         if (!(/<guid>[^<]*<\/guid>/.test(data))) {
            if (closed) {
               MissingE.debug("Stop preview request: Tab closed or changed.");
               dequeueAjax(this.targetId);
               return;
            }
            if (cacheServe("preview", request.pid, sendResponse, doPreview, true)) {
               return true;
            }
            else {
               this.tryCount++;
               if (this.tryCount <= this.retryLimit) {
                  MissingE.debug("Retry preview request (" + this.targetId + ")");
                  $.ajax(this);
                  return;
               }
               else {
                  MissingE.debug("preview request (" + this.targetId + ") failed");
                  dequeueAjax(this.targetId);
                  sendResponse(failMsg);
               }
            }
         }
         else {
            var info = parseRSS(data, request.type);
            saveCache(this.targetId, info);
            dequeueAjax(this.targetId);
            if (!closed) {
               doPreview(info, this.targetId, sendResponse);
            }
         }
      }
   });
}

function doReblogAjax(type, request, sender, sendResponse, hash, retries,
                              additional) {
   MissingE.debug("AJAX " + type + " request (" + request.pid + ")");
   startAjax(request.pid);
   var failMsg = {greeting:type, success:false, pid:request.pid};
   if (additional) {
      for (i in additional) {
         if (additional.hasOwnProperty(i)) {
            failMsg[i] = additional[i];
         }
      }
   }
   $.ajax({
      type: "GET",
      url: request.url,
      dataType: "html",
      tryCount: 0,
      retryLimit: retries,
      targetId: request.pid,
      tabId: sender.tab.id,
      tabHash: hash,
      error: function(xhr, textStatus) {
         if (xhr.status === 404) {
            MissingE.debug(type + " request (" + this.targetId + ") not found");
            dequeueAjax(this.targetId);
            sendResponse(failMsg);
            return;
         }
         if (this.tabHash !== tabs[this.tabId]) {
            MissingE.debug("Stop " + type + " request: Tab closed or changed.");
            dequeueAjax(this.targetId);
            return;
         }
         if (cacheServe(type, request.pid, sendResponse, doReblogDash, true)) {
            return true;
         }
         else {
            this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
               MissingE.debug("Retry " + type + " request (" + this.targetId + ")");
               $.ajax(this);
               return;
            }
            else {
               MissingE.debug(type + " request (" + this.targetId + ") failed");
               dequeueAjax(this.targetId);
               sendResponse(failMsg);
            }
         }
      },
      success: function(data, textStatus) {
         var closed = (this.tabHash !== tabs[this.tabId]);
         var ifr = data.match(/<\s*iframe[^>]*id="tumblr_controls"[^>]*>/);
         if (!ifr || ifr.length === 0) {
            if (closed) {
               MissingE.debug("Stop " + type + " request: Tab closed or changed.");
               dequeueAjax(this.targetId);
               return;
            }
            if (cacheServe(type, request.pid, sendResponse, doReblogDash, true)) {
               return true;
            }
            else {
               this.tryCount++;
               if (this.tryCount <= this.retryLimit) {
                  MissingE.debug("Retry " + type + " request (" + this.targetId + ")");
                  $.ajax(this);
                  return;
               }
               else {
                  MissingE.debug(type + " request (" + this.targetId + ") failed");
                  dequeueAjax(this.targetId);
                  sendResponse(failMsg);
               }
            }
         }
         else {
            var rk = ifr[0].match(/rk=([^&"']*)/);
            var poster = ifr[0].match(/name=([^&"']*)/);
            var user;
            if (rk && rk.length > 1) {
               if (!poster || poster.length <= 1) {
                  user = "";
               }
               else {
                  user = poster[1];
               }
               var info = {"reblog_key":rk[1],
                           "name":user};
               saveCache(this.targetId, info);
               dequeueAjax(this.targetId);
               if (!closed) {
                  doReblogDash(info, this.targetId, sendResponse);
               }
            }
            else if (!closed) {
               MissingE.debug(type + " request (" + this.targetId + ") failed");
               dequeueAjax(this.targetId);
               sendResponse(failMsg);
            }
         }
      }
   });
}

function requestBetterReblogsAsk(request, sender, sendResponse, hash) {
   if (hash !== tabs[sender.tab.id]) {
      MissingE.debug("Stop betterReblogs request: Tab closed or changed.");
      dequeueAjax();
      return;
   }
   else if (cacheServe("betterReblogs", request.pid, sendResponse, doReblogDash, false)) {
      return true;
   }
   else if (isRequested({type: "betterReblogs", request: request, sender: sender, sendResponse: sendResponse, hash: hash})) {
      return true;
   }
   else if (activeAjax >= maxActiveAjax) {
      queueAjax({type: "betterReblogs", request: request, sender: sender, sendResponse: sendResponse, hash: hash});
   }
   else {
      doReblogAjax("betterReblogs", request, sender, sendResponse, hash,
             getSetting("MissingE_betterReblogs_askRetries",MissingE.defaultRetries),
             { pid:request.pid });
   }
}

function requestReblogYourself(request, sender, sendResponse, hash) {
   if (hash !== tabs[sender.tab.id]) {
      MissingE.debug("Stop reblogYourself request: Tab closed or changed.");
      dequeueAjax();
      return;
   }
   else if (cacheServe("reblogYourself", request.pid, sendResponse, doReblogDash, false)) {
      return true;
   }
   else if (isRequested({type: "reblogYourself", request: request, sender: sender, sendResponse: sendResponse, hash: hash})) {
      return true;
   }
   else if (activeAjax >= maxActiveAjax) {
      queueAjax({type: "reblogYourself", request: request, sender: sender, sendResponse: sendResponse, hash: hash});
   }
   else {
      doReblogAjax("reblogYourself", request, sender, sendResponse, hash,
             getSetting("MissingE_reblogYourself_retries",MissingE.defaultRetries),
             { pid:request.pid });
   }
}

function requestTimestamp(request, sender, sendResponse, hash) {
   if (request.lang) { lang = request.lang; }
   if (hash !== tabs[sender.tab.id]) {
      MissingE.debug("Stop timestamp request: Tab closed or changed.");
      dequeueAjax();
      return false;
   }
   else if (cacheServe("timestamp", request.pid, sendResponse, doTimestamp, false)) {
      return true;
   }
   else if (isRequested({type: "timestamp", request: request, sender: sender, sendResponse: sendResponse, hash: hash})) {
      return true;
   }
   else if (activeAjax >= maxActiveAjax) {
      queueAjax({type: "timestamp", request: request, sender: sender, sendResponse: sendResponse, hash: hash});
   }
   else if (request.url === 'http://www.tumblr.com/edit/') {
      doAskAjax(request, sender, sendResponse, hash,
                getSetting("MissingE_timestamps_retries",MissingE.defaultRetries),
                "timestamp", doTimestamp);
   }
}

function requestTags(request, sender, sendResponse, hash) {
   if (hash !== tabs[sender.tab.id]) {
      MissingE.debug("Stop tags request: Tab closed or changed.");
      dequeueAjax();
      return;
   }
   else if (cacheServe("tags", request.pid, sendResponse, doTags, false)) {
      return true;
   }
   else if (isRequested({type: "tags", request: request, sender: sender, sendResponse: sendResponse, hash: hash})) {
      return true;
   }
   else if (activeAjax >= maxActiveAjax) {
      queueAjax({type: "tags", request: request, sender: sender, sendResponse: sendResponse, hash: hash});
   }
   else {
      doTagsAjax(request, sender, sendResponse, hash,
                 getSetting("MissingE_betterReblogs_retries",MissingE.defaultRetries));
   }
}

function requestNotes(request, sender, sendResponse, hash) {
   if (hash !== tabs[sender.tab.id]) {
      MissingE.debug("Stop notes request: Tab closed or changed.");
      dequeueAjax();
      return;
   }
   else if (activeAjax >= maxActiveAjax) {
      queueAjax({type: "notes", request: request, sender: sender, sendResponse: sendResponse, hash: hash});
   }
   else {
      doNotesAjax(request, sender, sendResponse, hash,
                  getSetting("MissingE_dashboardTweaks_previewRetries",MissingE.defaultRetries));
   }
}

function requestPreview(request, sender, sendResponse, hash) {
   if (hash !== tabs[sender.tab.id]) {
      MissingE.debug("Stop preview request: Tab closed or changed.");
      dequeueAjax();
      return;
   }
   else if (cacheServe("preview", request.pid, sendResponse, doPreview, false)) {
      return true;
   }
   else if (isRequested({type: "preview", request: request, sender: sender, sendResponse: sendResponse, hash: hash})) {
      return true;
   }
   else if (activeAjax >= maxActiveAjax) {
      queueAjax({type: "preview", request: request, sender: sender, sendResponse: sendResponse, hash: hash});
   }
   else {
      doPreviewAjax(request, sender, sendResponse, hash,
                    getSetting("MissingE_dashboardTweaks_previewRetries",MissingE.defaultRetries));
   }
}

function requestMagnifier(request, sender, sendResponse, hash) {
   if (hash !== tabs[sender.tab.id]) {
      MissingE.debug("Stop magnifier request: Tab closed or changed.");
      return;
   }
   else {
      if (!request.hasOwnProperty('src')) {
         sendResponse({pid: request.pid, success: false});
      }
      else {
         var ft = request.src.match(/\.[a-z]{2,4}$/i);
         var fullsrc = request.src.replace(/_\d+\.[a-z]{2,4}$/i,'_1280'+ft);

         var ajax = new XMLHttpRequest();
         ajax.open("HEAD", fullsrc, true);
         ajax.onreadystatechange = function() {
            if (this.readyState == 4) {
               if (this.status == 200) {
                  sendResponse({pid: request.pid, success:true, data: fullsrc});
               }
               else {
                  sendResponse({pid: request.pid, success:true, data: request.src});
               }
            }
         };
         ajax.send();
      }
   }
}

function loadUI(tabId, uiType) {
   if (uiType === "core") {
      chrome.tabs.executeScript(tabId, {file: "lib/jquery.ui.core.min.js"});
      chrome.tabs.executeScript(tabId, {file: "lib/jquery.ui.widget.min.js"});
      chrome.tabs.executeScript(tabId, {file: "lib/jquery.ui.mouse.min.js"});
   }
   else if (uiType === "draggable") {
      chrome.tabs.executeScript(tabId, {file: "lib/jquery.ui.draggable.min.js"});
   }
   else if (uiType === "sortable") {
      chrome.tabs.executeScript(tabId, {file: "lib/jquery.ui.sortable.min.js"});
   }
   else if (uiType === "resizable") {
      chrome.tabs.executeScript(tabId, {file: "lib/jquery.ui.resizable.min.js"});
   }
}

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
   if (!sender.tab) sendResponse({});
   else if (request.greeting == "updatedCheck") {
      sendResponse({uptodate:
         MissingE.versionCompare(getSetting("MissingE_version",'0'),
                                 request.v) >= 0});
   }
   else if (request.greeting == "postMessage") {
      alert(request.text);
   }
   else if (request.greeting == "getOptions") {
      sendResponse({greeting: "getOptions", options: createOptionString()});
   }
   else if (request.greeting == "getExtensionInfo") {
      sendResponse({greeting: "getExtensionInfo",
                    info:{ version: getSetting("MissingE_version",'0') }});
   }
   else if (request.greeting == "exportOptions") {
      sendResponse({greeting: "exportOptions",
                    url: "http://tools.missing-e.com/settings?" +
                         $.param(createOptionParams())});
   }
   else if (request.greeting == "importOptions") {
      receiveOptions(request, sendResponse);
   }
   else if (request.greeting == "fanMail") {
      chrome.tabs.captureVisibleTab(sender.tab.windowId, {format: "png"},
                                    function(dataURL) {
         dataURL = dataURL.replace(/^data:image\/png;base64,/,'');
         chrome.tabs.create({url: 'http://tools.missing-e.com/fanmail'},
                            function(tab) {
            chrome.tabs.executeScript(tab.id, {code:
               'document.getElementById("ss").value = "' + dataURL + '"; ' +
               'document.getElementById("theform").submit();'
            });
         });
      });
   }
   else if (request.greeting == "getAsker") {
      if (askerTable[sender.tab.url]) {
         MissingE.debug("Found saved asker for '" + sender.tab.url + "'");
         var name = askerTable[sender.tab.url].asker;
         var isSure = askerTable[sender.tab.url].isSure;
         if (--askerTable[sender.tab.url].count == 0) {
            MissingE.debug("Deleting saved asker for '" + sender.tab.url + "'");
            delete askerTable[sender.tab.url];
         }
         if (name && name !== "") {
            sendResponse({name: name, isSure: isSure, url: sender.tab.url});
         }
      }
      else {
         if (askerWaiters[sender.tab.url]) {
            MissingE.debug("Creating new askerWaiter for '" + sender.tab.url + "'");
            askerWaiters[sender.tab.url].push(sendResponse);
         }
         else {
            MissingE.debug("Adding askerWaiter for '" + sender.tab.url + "'");
            askerWaiters[sender.tab.url] = [sendResponse];
         }
      }
   }
   else if (request.greeting == "sendAsker") {
      if (askerWaiters[sender.tab.url]) {
         MissingE.debug("Found existing askerWaiter for '" + sender.tab.url + "'");
         var callback = askerWaiters[sender.tab.url].pop();
         if (askerWaiters[sender.tab.url].length === 0) {
            MissingE.debug("Deleting existing askerWaiter queue for '" + sender.tab.url + "'");
            delete askerWaiters[sender.tab.url];
         }
         if (request.name && request.name !== "") {
            callback({name: request.name, isSure: request.isSure, url: sender.tab.url});
         }
      }
      else {
         if (askerTable[sender.tab.url]) {
            MissingE.debug("Found existing askerTable entry for '" + sender.tab.url + "'");
            askerTable[sender.tab.url].count++;
         }
         else {
            MissingE.debug("Creating askerTable entry for '" + sender.tab.url + "'");
            askerTable[sender.tab.url] = {asker: request.name,
                                          isSure: request.isSure, count:1};
         }
      }
   }
   else if (request.greeting == "uploader") {
      $.ajax({
         url:"http://www.tumblr.com/upload/image",
         dataType:"html",
         retries:4,
         tryCount:0,
         success:function(data) {
            var key = data.match(/<input[^>]*name="form_key"[^>]*value="([^"]*)"[^>]*>/);
            if (!key || key.length < 2) {
               if (this.tryCount < this.retries) {
                  this.tryCount++;
                  $.ajax(this);
               }
               else {
                  sendResponse({greeting: "uploader", success: false});
               }
            }
            else {
               sendResponse({greeting: "uploader", success: true, data: key[1]});
            }
         },
         error:function() {
            if (this.tryCount < this.retries) {
               this.tryCount++;
               $.ajax(this);
            }
            else {
               sendResponse({greeting: "uploader", success: false});
            }
         }
      });
   }
   else if (request.greeting == "update") {
      sendResponse({update:
         MissingE.versionCompare(getSetting("MissingE_externalVersion",'0'),
                        getSetting("MissingE_version",'0')) > 0});
   }
   else if (request.greeting == "close-options") {
      closeTab(chrome.extension.getURL('core/options.html'), sender.tab.id);
   }
   else if (request.greeting == "magnifier") {
      requestMagnifier(request, sender, sendResponse, tabs[sender.tab.id]);
   }
   else if (request.greeting == "notes") {
      requestNotes(request, sender, sendResponse, tabs[sender.tab.id]);
   }
   else if (request.greeting == "preview") {
      requestPreview(request, sender, sendResponse, tabs[sender.tab.id]);
   }
   else if (request.greeting == "reblogYourself") {
      requestReblogYourself(request, sender, sendResponse, tabs[sender.tab.id]);
   }
   else if (request.greeting == "betterReblogs") {
      requestBetterReblogsAsk(request, sender, sendResponse, tabs[sender.tab.id]);
   }
   else if (request.greeting == "tags") {
      requestTags(request, sender, sendResponse, tabs[sender.tab.id]);
   }
   else if (request.greeting == "timestamp") {
      if (request.type == "ask") {
         requestTimestamp(request, sender, sendResponse, tabs[sender.tab.id]);
      }
      else if (cacheServe("timestamp", request.pid, sendResponse, doTimestamp, false, true)) {
         return true;
      }
      else {
         MissingE.debug("Building timestamp (" + request.pid + ")");
         var ts = MissingE.buildTimestamp(request.stamp);
         if (ts !== null) {
            var info = {"timestamp":ts};
            saveCache(request.pid,info);
            doTimestamp(info, request.pid, sendResponse);
         }
         else {
            sendResponse({pid: id, success: false});
         }
      }
   }
   else if (request.greeting == "sidebarTweaks") {
      setSetting("MissingE_sidebarTweaks_accountNum", request.accountNum);
   }
   else if (request.greeting == "backupVal") {
      setSetting(request.key, request.val);
   }
   else if (request.greeting == "getBackupVal") {
      sendResponse({key: request.key, val: getSetting(request.key)});
   }
   else if (request.greeting == "tumblrPermission") {
      checkPermission(request, sender, sendResponse, tabs[sender.tab.id],
                      getSetting("MissingE_postingTweaks_subEditRetries",MissingE.defaultRetries));
   }
   else if (request.greeting == "sendCrushes") {
      if (getSetting("MissingE_postCrushes_newTab",1) === 1) {
         chrome.tabs.create({windowId: sender.tab.windowId,
                             index: (sender.tab.index+1),
                             url: request.url}, function(tab) {
            crushes[tab.id] = {img: request.img, tags: request.tags};
         });
      }
      else {
         crushes[sender.tab.id] = {img: request.img, tags: request.tags};
         chrome.tabs.update(sender.tab.id, {url: request.url, selected: true});
      }
   }
   else if (request.greeting == "getCrushes") {
      if (crushes.hasOwnProperty(sender.tab.id)) {
         sendResponse(crushes[sender.tab.id]);
         delete crushes[sender.tab.id];
      }
   }
   else if (request.greeting == "sendReply") {
      if (request.newReply &&
          getSetting("MissingE_replyReplies_newTab",1) === 1) {
         chrome.tabs.create({windowId: sender.tab.windowId,
                             index: (sender.tab.index+1),
                             url: request.url}, function(tab) {
            replies[tab.id] = {reply: request.reply, tags: request.tags};
         });
      }
      else {
         replies[sender.tab.id] = {reply: request.reply, tags: request.tags};
         chrome.tabs.update(sender.tab.id, {url: request.url, selected: true});
      }
   }
   else if (request.greeting == "getReply") {
      if (replies.hasOwnProperty(sender.tab.id)) {
         sendResponse(replies[sender.tab.id]);
         delete replies[sender.tab.id];
      }
   }
   else if (request.greeting == "settings") {
      var settings = {};
      settings.component = request.component;
      var tumblrs = getSetting("MissingE_tumblrs",'');
      settings.tumblrAccounts = [];
      while (tumblrs.length > 0) {
         var len = tumblrs.indexOf(":");
         var acct = tumblrs.substring(0,len);
         tumblrs = tumblrs.substring(len+1);
         len = tumblrs.indexOf(",");
         if (len < 0) { len = tumblrs.length; }
         var acctTxt = tumblrs.substring(0,len);
         tumblrs = tumblrs.substring(len+1);
         acctTxt = acctTxt.replace(/%%/g,"%").replace(/%2C/g,",");
         settings.tumblrAccounts.push({account:acct,name:acctTxt});
      }
      switch(request.component) {
         case "konami":
            settings.active = getSetting("MissingE_konami_active",0);
            break;
         case "askTweaks":
            settings.scroll = getSetting("MissingE_askTweaks_scroll",1);
            settings.betterAnswers = getSetting("MissingE_askTweaks_betterAnswers",0);
            settings.tagAsker = getSetting("MissingE_askTweaks_tagAsker",1);
            settings.defaultTags = getSetting("MissingE_askTweaks_defaultTags",'');
            if (settings.defaultTags !== '') {
               settings.defaultTags = settings.defaultTags.replace(/, /g,',').split(',');
            }
            settings.askDash = getSetting("MissingE_askTweaks_askDash",0);
            settings.massDelete = getSetting("MissingE_askTweaks_massDelete",1);
            settings.adjustDomain = MissingE.isTumblrURL(sender.tab.url, ["messages"]);
            settings.photoReplies = getSetting("MissingE_askTweaks_photoReplies",1);
            settings.submissionControls = getSetting("MissingE_askTweaks_submissionControls",1);
            break;
         case "sidebarTweaks":
            settings.retries = getSetting("MissingE_sidebarTweaks_retries",MissingE.defaultRetries);
            settings.accountNum = getSetting("MissingE_sidebarTweaks_accountNum",0);
            settings.slimSidebar = getSetting("MissingE_sidebarTweaks_slimSidebar",0);
            settings.addSidebar = getSetting("MissingE_sidebarTweaks_addSidebar",0);
            settings.showTags = getSetting("MissingE_sidebarTweaks_showTags",0);
            break;
         case "bookmarker":
            settings.backupMarks = getSetting("MissingE_bookmarker_marks","");
            settings.format = getSetting("MissingE_bookmarker_format",MissingE.defaultFormat);
            settings.addBar = getSetting("MissingE_bookmarker_addBar",1);
            settings.keyboardShortcut = getSetting("MissingE_bookmarker_keyboardShortcut",1);
            break;
         case "dashboardTweaks":
            settings.replaceIcons = getSetting("MissingE_dashboardTweaks_replaceIcons",1);
            settings.textControls = getSetting("MissingE_dashboardTweaks_textControls",0);
            settings.smallIcons = getSetting("MissingE_dashboardTweaks_smallIcons",0);
            settings.postLinks = getSetting("MissingE_dashboardTweaks_postLinks",1);
            settings.reblogReplies = getSetting("MissingE_dashboardTweaks_reblogReplies",0);
            settings.widescreen = getSetting("MissingE_dashboardTweaks_widescreen",0);
            settings.queueArrows = getSetting("MissingE_dashboardTweaks_queueArrows",1);
            settings.noExpandAll = getSetting("MissingE_dashboardTweaks_noExpandAll",0);
            settings.massDelete = getSetting("MissingE_dashboardTweaks_massDelete",1);
            settings.randomQueue = getSetting("MissingE_dashboardTweaks_randomQueue",1);
            settings.sortableNotes = getSetting("MissingE_dashboardTweaks_sortableNotes",1);
            settings.notePreview = getSetting("MissingE_dashboardTweaks_notePreview",1);
            settings.simpleHighlight = getSetting("MissingE_dashboardTweaks_simpleHighlight",0);
            settings.pagedNav = getSetting("MissingE_dashboardTweaks_pagedNav",0);
            settings.keyboardShortcut = getSetting("MissingE_dashboardTweaks_keyboardShortcut",1);
            break;
         case "dashLinksToTabs":
            settings.newPostTabs = getSetting("MissingE_dashLinksToTabs_newPostTabs",1);
            settings.sidebar = getSetting("MissingE_dashLinksToTabs_sidebar",0);
            settings.reblogLinks = getSetting("MissingE_dashLinksToTabs_reblogLinks",0);
            settings.editLinks = getSetting("MissingE_dashLinksToTabs_editLinks",0);
            break;
         case "replyReplies":
            settings.showAvatars = getSetting("MissingE_replyReplies_showAvatars",1);
            settings.smallAvatars = getSetting("MissingE_replyReplies_smallAvatars",1);
            settings.addTags = getSetting("MissingE_replyReplies_addTags",1);
            settings.defaultTags = getSetting("MissingE_replyReplies_defaultTags",'');
            if (settings.defaultTags !== '') {
               settings.defaultTags = settings.defaultTags.replace(/, /g,',').split(',');
            }
            break;
         case "postCrushes":
            settings.prefix = getSetting("MissingE_postCrushes_prefix","Tumblr Crushes:");
            settings.crushSize = getSetting("MissingE_postCrushes_crushSize",1);
            settings.addTags = getSetting("MissingE_postCrushes_addTags",1);
            settings.showPercent = getSetting("MissingE_postCrushes_showPercent",1);
            break;
         case "postingTweaks":
            settings.photoReplies = getSetting("MissingE_postingTweaks_photoReplies",1);
            settings.addUploader = getSetting("MissingE_postingTweaks_addUploader",1);
            settings.quickButtons = getSetting("MissingE_postingTweaks_quickButtons",1);
            settings.blogSelect = getSetting("MissingE_postingTweaks_blogSelect",0);
            settings.tagQueuedPosts = getSetting("MissingE_postingTweaks_tagQueuedPosts",0);
            settings.queueTags = getSetting("MissingE_postingTweaks_queueTags",'');
            if (settings.queueTags !== '') {
               settings.queueTags = settings.queueTags.replace(/, /g,',').split(',');
            }
            settings.showAnswers = getSetting("MissingE_postingTweaks_showAnswers",0);
            settings.facebookOff = getSetting("MissingE_postingTweaks_facebookOff",0);
            settings.smartRedirect = getSetting("MissingE_postingTweaks_smartRedirect",0);
            break;
         case "magnifier":
            settings.magnifyAvatars = getSetting("MissingE_magnifier_magnifyAvatars",0);
            break;
         case "safeDash":
            settings.keyboardShortcut = getSetting("MissingE_safeDash_keyboardShortcut",1);
            break;
         case "betterReblogs":
            settings.passTags = getSetting("MissingE_betterReblogs_passTags",1);
            settings.autoFillTags = getSetting("MissingE_betterReblogs_autoFillTags",1);
            settings.quickReblog = getSetting("MissingE_betterReblogs_quickReblog",0);
            settings.accountName = '0';
            if (getSetting("MissingE_betterReblogs_quickReblogAcctType",0) == 1) {
               settings.accountName = getSetting("MissingE_betterReblogs_quickReblogAcctName",'0');
            }
            settings.quickReblogForceTwitter = getSetting("MissingE_betterReblogs_quickReblogForceTwitter","default");
            settings.quickReblogForceFacebook = getSetting("MissingE_betterReblogs_quickReblogForceFacebook","default");
            settings.quickReblogCaption = getSetting("MissingE_betterReblogs_quickReblogCaption",1);
            settings.fullText = getSetting("MissingE_betterReblogs_fullText",0);
            settings.tagQueuedPosts = (getSetting("MissingE_postingTweaks_enabled",1) == 1 && getSetting("MissingE_postingTweaks_tagQueuedPosts",0) == 1) ? 1: 0;
            settings.queueTags = getSetting("MissingE_postingTweaks_queueTags",'');
            if (settings.queueTags !== '') {
               settings.queueTags = settings.queueTags.replace(/, /g,',').split(',');
            }
            settings.tagReblogs = getSetting("MissingE_betterReblogs_tagReblogs",0);
            settings.reblogTags = getSetting("MissingE_betterReblogs_reblogTags",'');
            if (settings.reblogTags !== '') {
               settings.reblogTags = settings.reblogTags.replace(/, /g,',').split(',');
            }
            settings.reblogAsks = 0;//getSetting("MissingE_betterReblogs_reblogAsks",0);
            settings.quickKeyboardShortcut = getSetting("MissingE_betterReblogs_quickKeyboardShortcut",1);
            break;
      }
      sendResponse(settings);
   }
   else if (request.greeting == "earlyStyles") {
      var injectSlimSidebar = false;

      if (getSetting("MissingE_askTweaks_enabled",1) == 1) {
         if (getSetting("MissingE_askTweaks_smallFanMail",0) == 1 &&
             MissingE.isTumblrURL(request.url, ["fanMail", "messages"])) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/askTweaks/smallFanMail.css", allFrames: true});
         }
         if (getSetting("MissingE_askTweaks_allFanMail",0) == 1 &&
             MissingE.isTumblrURL(request.url, ["messages"])) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/askTweaks/allFanMail.css"});
         }
      }

      if (MissingE.isTumblrURL(request.url, ["upload"]) &&
          MissingE.isTumblrURL(sender.tab.url,
                               ["dashboard", "blog", "likes", "tagged"])) {
         if (getSetting("MissingE_dashboardTweaks_enabled",1) == 1 &&
             getSetting("MissingE_dashboardTweaks_smallIcons",0) == 1) {
            sendResponse({styles: [{file: "core/dashboardTweaks/smallIcons.css"}]});
         }
         return;
      }

      if (MissingE.isTumblrURL(request.url,
                      ["dashboard",
                       "blog",
                       "blogData",
                       "drafts",
                       "queue",
                       "messages",
                       "likes",
                       "tagged"])) {

         chrome.tabs.insertCSS(sender.tab.id, {code:
               '#posts .post .post_controls .MissingE_experimental_reply, ' +
               '#posts .post .post_controls .MissingE_experimental_reply_wait, ' +
               '#posts .post .post_controls .MissingE_experimental_reply_fail, ' +
               '#posts .post .post_controls .MissingE_experimental_reply_success, ' +
               '#posts .post .post_controls .MissingE_reblogYourself_retry, ' +
               '#posts .post .post_controls .MissingE_betterReblogs_retryAsk { ' +
                  'background-image:url("' +
                     chrome.extension.getURL("core/dashboardTweaks/postControls.png") +
                  '") !important; ' +
               '} ' +
               '#posts .post .post_controls .MissingE_quick_reblogging { ' +
                  'background-image:url("' +
                     chrome.extension.getURL("core/betterReblogs/reblogging.gif") +
                  '") !important; ' +
               '} ' +
               '#posts .post .post_controls .MissingE_quick_reblogging_success { ' +
                  'background-image:url("' +
                     chrome.extension.getURL("core/betterReblogs/reblogSuccess.png") +
                  '") !important; ' +
               '}'});

         if (getSetting("MissingE_dashboardTweaks_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/dashboardTweaks.css"});
            if (getSetting("MissingE_dashboardTweaks_smallIcons",0) == 1) {
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/smallIcons.css"});
            }
            if (getSetting("MissingE_dashboardTweaks_notePreview",1) == 1) {
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/preview.css"});
               chrome.tabs.insertCSS(sender.tab.id, {code:
                  '#MissingE_preview .previewIcon { ' +
                     'background-image:url("' +
                     chrome.extension.getURL("core/dashboardTweaks/prevIcon.png") +
                     '"); ' +
                  '}' +
                  '#MissingE_preview.MissingE_preview_loading { ' +
                     'background-image:url("' +
                     chrome.extension.getURL("core/dashboardTweaks/loader.gif") +
                     '");' +
                  '}' +
                  '#MissingE_preview.MissingE_preview_fail { ' +
                     'background-image:url("' +
                     chrome.extension.getURL("core/dashboardTweaks/prevFail.png") +
                     '");' +
                  '}'});
            }
            if (getSetting("MissingE_dashboardTweaks_replaceIcons",1) == 1) {
               chrome.tabs.insertCSS(sender.tab.id, {code:
                  '#posts .post .post_controls a[id^="ask_answer_link"], ' +
                  '#posts .post.fan_mail .controls a.reply_link, ' +
                  '#posts .post .post_controls a[href^="/edit"], ' +
                  '#dashboard_inbox .post .post_controls a[id^="post_delete_"], ' +
                  '#posts .post .post_controls a[onclick*="delete_post_"], ' +
                  '#posts .post .post_controls a[onclick*="queue_post"], ' +
                  '#posts .post .post_controls a[onclick*="approve_post"], ' +
                  '#posts .post .post_controls a[onclick*="publish_post"] { ' +
                     'background-image:url("' +
                     chrome.extension.getURL("core/dashboardTweaks/postControls.png") +
                     '"); ' +
                  '}'});
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/replaceIcons.css"});
            }
            if (getSetting("MissingE_dashboardTweaks_textControls",0) == 1) {
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/textControls.css"});
            }
            if (getSetting("MissingE_dashboardTweaks_reblogQuoteFit",1) == 1)
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/reblogQuoteFit.css"});
            if (getSetting("MissingE_dashboardTweaks_wrapTags",1) == 1)
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/wrapTags.css"});
            if (getSetting("MissingE_dashboardTweaks_postLinks",1) == 1)
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/postLinks.css"});
            if (getSetting("MissingE_dashboardTweaks_massDelete",1) == 1 ||
                getSetting("MissingE_dashboardTweaks_randomQueue",1) == 1)
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/draftQueueTools.css"});
            if (getSetting("MissingE_dashboardTweaks_sortableNotes",1) == 1)
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/notesSorter.css"});
            if (getSetting("MissingE_dashboardTweaks_widescreen",0) == 1 &&
                !MissingE.isTumblrURL(sender.tab.url, ["settings"]))
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/widescreen.css"});
            if (getSetting("MissingE_dashboardTweaks_queueArrows",1) == 1 &&
                MissingE.isTumblrURL(sender.tab.url, ["queue"]))
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/queueArrows.css"});
            if (getSetting("MissingE_dashboardTweaks_simpleHighlight",0) == 1)
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/dashboardTweaks/simpleHighlight.css"});
         }

         if (getSetting("MissingE_safeDash_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/safeDash/safeDash.css"});
            if (getSetting("MissingE_safeDash_photosetAll",0) == 1) {
               chrome.tabs.insertCSS(sender.tab.id, {file: "core/safeDash/photosetAll.css"});
            }
            chrome.tabs.insertCSS(sender.tab.id, {code:
               '#right_column #MissingE_safeDash li a {' +
                  'background-image:url("' +
                  chrome.extension.getURL("core/safeDash/lockicon.png") +
                  '") !important; ' +
               '} ' +
               'body.MissingE_safeDash #posts div.post.photo .post_content > div:first-child, ' +
               'body.MissingE_safeDash #posts div.post.photo .flipcard img, ' +
               'body.MissingE_safeDash #posts div.post.photo .photoset_photo, ' +
               'body.MissingE_safeDash #posts div.post.photo img.image_thumbnail, ' +
               'body.MissingE_safeDash #posts div.post.video .video_thumbnail, ' +
               'body.MissingE_safeDash #posts div.post.video .video_embed, ' +
               'body.MissingE_safeDash #posts div.post.video span[id^="video_player"], ' +
               'body.MissingE_safeDash #posts li.notification blockquote[style], ' +
               'body.MissingE_safeDash #posts div.post ol.notes blockquote.photo_container, ' +
               'body.MissingE_safeDash #posts div.post .post_content p .nsfw_span, ' +
               'body.MissingE_safeDash #posts div.post .post_content img.album_art, ' +
               'body.MissingE_safeDash #posts div.post .post_content img[onclick*="album_art"], ' +
               'body.MissingE_safeDash #posts div.post.video .tumblr_video_container { ' +
                  'background-image:url("' +
                  chrome.extension.getURL("core/safeDash/lock.png") +
                  '");' +
               '}'});
         }

         if (getSetting("MissingE_bookmarker_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/bookmarker/bookmarker.css"});
         }

         if (getSetting("MissingE_sidebarTweaks_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/sidebarTweaks/sidebarTweaks.css"});
            if (getSetting("MissingE_sidebarTweaks_slimSidebar",0) == 1) {
               injectSlimSidebar = true;
            }
         }

         if (getSetting("MissingE_magnifier_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/magnifier/magnifier.css"});
         }

         if (getSetting("MissingE_askTweaks_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/askTweaks/askTweaks.css"});
         }
      }

      if (MissingE.isTumblrURL(sender.tab.url, ["massEditor"])) {
        if (getSetting("MissingE_massEditor_enabled",1) == 1) {
           chrome.tabs.insertCSS(sender.tab.id, {file: "core/massEditor/massEditor.css"});
           if (getSetting("MissingE_massEditor_showNotes",1) == 1) {
              chrome.tabs.insertCSS(sender.tab.id, {file: "core/massEditor/showNotes.css"});
           }
        }
      }

      if (MissingE.isTumblrURL(request.url,
                      ["post",
                       "reblog",
                       "messages",
                       "drafts"])) {
         if (getSetting("MissingE_postingTweaks_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/postingTweaks/postingTweaks.css"});
         }
      }

      if (MissingE.isTumblrURL(request.url,
                      ["dashboard",
                       "blog",
                       "tagged"])) {
         if (getSetting("MissingE_replyReplies_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {code: "#posts .notification .notification_type_icon { background-image:url('" + chrome.extension.getURL('core/replyReplies/notification_icons.png') + "') !important; } #posts ol.notes .notification_type_icon { background-image:url('" + chrome.extension.getURL('core/replyReplies/notes_icons.png') + "') !important; }"});
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/replyReplies/replyReplies.css"});
         }
      }

      if (MissingE.isTumblrURL(request.url, ["following"])) {
         if (getSetting("MissingE_magnifier_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/magnifier/magnifier.css"});
         }
      }

      if (MissingE.isTumblrURL(request.url,
                      ["dashboard",
                       "blog",
                       "likes",
                       "tagged"])) {
         if (getSetting("MissingE_betterReblogs_enabled",1) == 1) {
            chrome.tabs.insertCSS(sender.tab.id, {code: "#MissingE_quick_reblog #MissingE_qr_nipple { background-image:url('" + chrome.extension.getURL('core/betterReblogs/qrnipple.png') + "') !important; }"});
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/betterReblogs/quickReblogMenu.css"});
         }
      }

      if (injectSlimSidebar) {
         chrome.tabs.insertCSS(sender.tab.id, {file: "core/sidebarTweaks/slimSidebar.css"});
      }
   }
   else if (request.greeting == "start") {
      addTab(sender.tab.id, sender.tab.url);
      chrome.tabs.executeScript(sender.tab.id, {file: "extension.js", allFrames: true});
      chrome.tabs.executeScript(sender.tab.id, {file: "core/utils.js", allFrames: true});
      if (!MissingE.isTumblrURL(request.url, ["askForm", "fanMail"])) {
         chrome.tabs.executeScript(sender.tab.id, {file: "lib/jquery-1.7.2.min.js"});
         chrome.tabs.executeScript(sender.tab.id, {file: "lib/evalFix.js"});
         chrome.tabs.executeScript(sender.tab.id, {file: "core/common/ajaxEvents.js"});
      }
      var activeScripts = {};
      activeScripts.version = currVersion;
      var zindexFix = false;
      var loadedUI = false, loadedUIresizable = false, loadedUIsortable = false,
          loadedUIdraggable = false;
      var widenIframe = false;
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url, ["dashboard", "messages"])) {
         chrome.tabs.executeScript(sender.tab.id, {file: "core/common/getAccounts.js"});
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url, ["dashboardOnly"])) {
         chrome.tabs.executeScript(sender.tab.id, {file: "core/common/warningInfo.js"});
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url, ["massEditor"])) {
         if (getSetting("MissingE_massEditor_enabled",1) == 1) {
            activeScripts.massEditor = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/massEditor/massEditor.js"});
         }
         else
            activeScripts.massEditor = false;
      }
      /*** Not to be activated yet
      if (MissingE.isTumblrURL(request.url, ["iframe"])) {
         chrome.tabs.executeScript(sender.tab.id, {file: "core/common/security.js"});
      }
      ***/
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url,
                      ["dashboard",
                       "blog",
                       "blogData",
                       "drafts",
                       "queue",
                       "messages",
                       "likes",
                       "tagged"])) {
         chrome.tabs.executeScript(sender.tab.id, {file: "core/common/konami.js"});

         if (getSetting("MissingE_safeDash_enabled",1) == 1) {
            activeScripts.safeDash = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/safeDash/safeDash.js"});
         }
         else
            activeScripts.safeDash = false;

         if (getSetting("MissingE_dashLinksToTabs_enabled",1) == 1) {
            activeScripts.dashLinksToTabs = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/dashLinksToTabs/dashLinksToTabs.js"});
         }
         else
            activeScripts.dashLinksToTabs = false;

         if (getSetting("MissingE_bookmarker_enabled",1) == 1) {
            activeScripts.bookmarker = true;
            if (!loadedUI) {
               loadedUI = true;
               loadUI(sender.tab.id, "core");
            }
            if (!loadedUIsortable) {
               loadedUIsortable = true;
               loadUI(sender.tab.id, "sortable");
            }
            chrome.tabs.executeScript(sender.tab.id, {file: "core/bookmarker/bookmarker.js"});
         }
         else
            activeScripts.bookmarker = false;

         if (getSetting("MissingE_magnifier_enabled",1) == 1 ||
             (getSetting("MissingE_askTweaks_enabled",1) == 1 &&
              getSetting("MissingE_askTweaks_askDash",0) == 1)) {
            zindexFix = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "lib/facebox/facebox.js"});
            chrome.tabs.insertCSS(sender.tab.id, {file: "lib/facebox/facebox.css"});
         }

         if (getSetting("MissingE_sidebarTweaks_enabled",1) == 1) {
            activeScripts.sidebarTweaks = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/sidebarTweaks/sidebarTweaks.js"});
         }
         else
            activeScripts.sidebarTweaks = false;

         if (getSetting("MissingE_magnifier_enabled",1) == 1) {
            activeScripts.magnifier = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/magnifier/magnifier.js"});
         }
         else
            activeScripts.magnifier = false;

         if (getSetting("MissingE_dashboardTweaks_enabled",1) == 1) {
            activeScripts.dashboardTweaks = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/dashboardTweaks/dashboardTweaks.js"});
            if (getSetting("MissingE_dashboardTweaks_sortableNotes",1) == 1) {
               if (!loadedUI) {
                  loadedUI = true;
                  loadUI(sender.tab.id, "core");
               }
               if (!loadedUIsortable) {
                  loadedUIsortable = true;
                  loadUI(sender.tab.id, "sortable");
               }
            }
         }
         else
            activeScripts.dashboardTweaks = false;

         if (getSetting("MissingE_askTweaks_enabled",1) == 1) {
            activeScripts.askTweaks = true;
            if (!loadedUI) {
               loadedUI = true;
               loadUI(sender.tab.id, "core");
            }
            if (!loadedUIdraggable) {
               loadedUIdraggable = true;
               loadUI(sender.tab.id, "draggable");
            }
            chrome.tabs.executeScript(sender.tab.id, {file: "core/askTweaks/askTweaks.js"});
         }
         else {
            activeScripts.askTweaks = false;
         }
      }
      if (MissingE.isTumblrURL(request.url, ["askForm", "fanMail"])) {
         if (getSetting("MissingE_askTweaks_enabled",1)) {
            activeScripts.askTweaks = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/askTweaks/askTweaks.js", allFrames: true});
         }
         else { activeScripts.askTweaks = false; }
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url,
                      ["post",
                       "reblog",
                       "messages",
                       "queue",
                       "drafts"])) {
         if (getSetting("MissingE_postingTweaks_enabled",1) == 1) {
            activeScripts.postingTweaks = true;
            if (!loadedUI) {
               loadedUI = true;
               loadUI(sender.tab.id, "core");
            }
            if (!loadedUIresizable) {
               loadedUIresizable = true;
               loadUI(sender.tab.id, "resizable");
            }
            chrome.tabs.executeScript(sender.tab.id, {file: "core/postingTweaks/postingTweaks.js"});
         }
         else
            activeScripts.postingTweaks = false;
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url, ["reblog"])) {
         if (getSetting("MissingE_betterReblogs_enabled",1) == 1) {
            activeScripts.betterReblogs = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/betterReblogs/betterReblogs_fill.js"});
         }
         else
            activeScripts.betterReblogs = false;

         if (getSetting("MissingE_reblogYourself_enabled",1) == 1) {
            activeScripts.reblogYourself = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/reblogYourself/reblogYourself_fill.js"});
         }
         else
            activeScripts.reblogYourself = false;
      }
      if (MissingE.isTumblrURL(request.url, ["iframe"]) &&
          !MissingE.isTumblrURL(sender.tab.url, ["post", "reblog"])) {
         // Fix issue with "endless pages" feature of FastestChrome
         chrome.tabs.insertCSS(sender.tab.id, {code:
            '.endless-pages-loaded-page iframe#tumblr_controls {' +
               'display:none;' +
            '}'
         });
         if (getSetting("MissingE_gotoDashPost_enabled",1) == 1) {
            activeScripts.gotoDashPost = true;
            widenIframe = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/gotoDashPost/gotoDashPost.js", allFrames: true});
         }
         else
            activeScripts.gotoDashPost = false;

         if (getSetting("MissingE_reblogYourself_enabled",1) == 1 &&
             getSetting("MissingE_reblogYourself_postPage",1) == 1) {
            activeScripts.reblogYourself = true;
            widenIframe = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/reblogYourself/reblogYourself_post.js", allFrames: true});
         }
         else
            activeScripts.reblogYourself = false;

         if (getSetting("MissingE_betterReblogs_enabled",1) == 1 &&
             getSetting("MissingE_betterReblogs_passTags",1) == 1) {
            activeScripts.betterReblogs = true;
            widenIframe = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/betterReblogs/betterReblogs_post.js", allFrames: true});
         }
         else
            activeScripts.betterReblogs = false;

         if (getSetting("MissingE_postingTweaks_enabled",1) == 1 &&
             getSetting("MissingE_postingTweaks_subEdit",1) == 1) {
            activeScripts.postingTweaks = true;
            widenIframe = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/postingTweaks/postingTweaks_post.js", allFrames: true});
         }
         else
            activeScripts.postingTweaks = false;
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url,
                      ["dashboard",
                       "blog",
                       "tagged"])) {
         if (getSetting("MissingE_replyReplies_enabled",1) == 1) {
            activeScripts.replyReplies = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/replyReplies/replyReplies.js"});
         }
         else
            activeScripts.replyReplies = false;
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url, ["reply"])) {
         if (getSetting("MissingE_replyReplies_enabled",1) == 1) {
            activeScripts.replyReplies = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/replyReplies/replyReplies_fill.js"});
         }
         else
            activeScripts.replyReplies = false;
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url, ["following"])) {
         if (getSetting("MissingE_postCrushes_enabled",1) == 1) {
            activeScripts.postCrushes = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/postCrushes/postCrushes.js"});
         }
         else
            activeScripts.postCrushes = false;

         if (getSetting("MissingE_magnifier_enabled",1) == 1) {
            activeScripts.magnifier = true;
            zindexFix = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "lib/facebox/facebox.js"});
            chrome.tabs.insertCSS(sender.tab.id, {file: "lib/facebox/facebox.css"});
            chrome.tabs.executeScript(sender.tab.id, {file: "core/magnifier/magnifier.js"});
         }
         else
            activeScripts.magnifier = false;
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url, ["crushes"])) {
         if (getSetting("MissingE_postCrushes_enabled",1) == 1) {
            activeScripts.postCrushes = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/postCrushes/postCrushes_fill.js"});
         }
         else
            activeScripts.postCrushes = false;
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url,
                      ["dashboard",
                       "blog",
                       "likes",
                       "messages",
                       "tagged"])) {
         if (getSetting("MissingE_timestamps_enabled",1) == 1) {
            activeScripts.timestamps = true;
            chrome.tabs.executeScript(sender.tab.id, {file: "core/timestamps/timestamps.js"});
         }
         else
            activeScripts.timestamps = false;
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url,
                      ["dashboard",
                       "blog",
                       "likes",
                       "tagged"])) {
         if (getSetting("MissingE_betterReblogs_enabled",1) == 1) {
            activeScripts.betterReblogs = true;
            if (getSetting("MissingE_betterReblogs_quickReblog",0) == 1) {
               zindexFix = true;
            }
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/betterReblogs/betterReblogs.css"});
            chrome.tabs.executeScript(sender.tab.id, {file: "core/betterReblogs/betterReblogs_dash.js"});
         }
         else
            activeScripts.betterReblogs = false;
      }
      if (sender.tab.url == request.url &&
          MissingE.isTumblrURL(sender.tab.url,
                      ["dashboard",
                       "blog",
                       "likes",
                       "tagged",
                       "drafts",
                       "queue",
                       "messages"])) {
         if (getSetting("MissingE_reblogYourself_enabled",1) == 1 &&
             getSetting("MissingE_reblogYourself_dashboard",1) == 1) {
            activeScripts.reblogYourself = true;
            chrome.tabs.insertCSS(sender.tab.id, {file: "core/reblogYourself/reblogYourself.css"});
            chrome.tabs.executeScript(sender.tab.id, {file: "core/reblogYourself/reblogYourself_dash.js"});
         }
         else
            activeScripts.reblogYourself = false;
      }
      if (zindexFix) {
         chrome.tabs.executeScript(sender.tab.id, {file: "core/common/zindexFix.js"});
      }
      if (widenIframe) {
         chrome.tabs.insertCSS(sender.tab.id, {file: "core/common/widenIframe.css"});
      }

      activeScripts.url = request.url;
      sendResponse(JSON.stringify(activeScripts));
   }
});

function collapseSettings(toPref, oldA, oldB) {
   var prefA = localStorage[oldA];
   var prefB = localStorage[oldB];
   var newPref;
   if (prefA || prefB) {
      MissingE.log('"' + oldA + '" and "' + oldB + '" depracated. Moving settings to "' + toPref + '"');
   }
   if (prefA === "1" || prefB === "1") {
      newPref = "1";
   }
   if (prefA || prefB) {
      if (localStorage.getItem(toPref) === null) {
         localStorage[toPref] = newPref;
      }
      localStorage.removeItem(oldA);
      localStorage.removeItem(oldB);
   }
}

function clearSetting(pref) {
   localStorage.removeItem(pref);
}

function moveSetting(oldpref, newpref) {
   var pref;
   if ((pref = localStorage[oldpref])) {
      msg = '"' + oldpref + '" depracated.';
      if (localStorage.getItem(newpref) === null) {
         msg += 'Moving setting to "' + newpref + '"';
         localStorage[newpref] = pref;
      }
      MissingE.log(msg);
      localStorage.removeItem(oldpref);
   }
}

function moveAllSettings(oldgroup, newgroup) {
   var re = new RegExp("^MissingE_" + oldgroup + "_");
   for (i in localStorage) {
      if (localStorage.hasOwnProperty(i) &&
          re.test(i)) {
         var newpref = i.replace(re,'MissingE_' + newgroup + '_');
         MissingE.log('"' + i + '" depracated. Moving setting to "' + newpref + '"');
         if (localStorage.getItem(newpref) === null) {
            localStorage[newpref] = localStorage[i];
         }
         localStorage.removeItem(i);
      }
   }
}

function invertSetting(oldpref, newpref) {
   var pref;
   if ((pref = localStorage[oldpref])) {
      MissingE.log('"' + oldpref + '" changed to inverted setting "' + newpref + '"');
      if (localStorage.getItem(newpref) === null) {
         localStorage[newpref] = (pref === "1" || pref === 1 ? "0" : "1");
      }
      localStorage.removeItem(oldpref);
   }
}

function settingChange(pref, from, to) {
   var val;
   var re = new RegExp("[" + from + "]", "g");
   if ((val = localStorage[pref])) {
      var newval = val.replace(re, to);
      if (newval !== val) {
         MissingE.log('"' + pref + '" changed from \'' + val + '\' to \'' + newval + '\'');
         localStorage[pref] = newval;
      }
   }
}

function getExternalVersion() {
   $.ajax({
      type: "GET",
      url: 'http://missing-e.com/version',
      dataType: "text",
      success: function(data, textStatus, xhr) {
         setSetting('MissingE_lastUpdateCheck', (new Date()).valueOf());
         var versionInfo = data.split(" ");
         versionInfo[versionInfo.length-1] =
            versionInfo[versionInfo.length-1].replace(/\s*$/m,'');
         setSetting('MissingE_externalVersion', versionInfo[0]);
         if (versionInfo.length > 1) {
            setSetting('MissingE_externalVersion_link', versionInfo[1]);
         }
         else {
            setSetting('MissingE_externalVersion_link', '');
         }
      }
   });
}

currVersion = getVersion();

function fixupSettings() {
   moveAllSettings('askFixes','askTweaks');
   moveAllSettings('dashboardFixes','dashboardTweaks');
   moveAllSettings('postingFixes','postingTweaks');
   clearSetting('MissingE_postingTweaks_uploaderToggle');
   clearSetting('MissingE_experimentalFeatures_enabled');
   clearSetting('MissingE_sidebarTweaks_followingLink');
   clearSetting('MissingE_betterReblogs_keyboardShortcut');
   settingChange('MissingE_bookmarker_format',',;','.');
   invertSetting('MissingE_dashboardTweaks_expandAll','MissingE_dashboardTweaks_noExpandAll');
   moveSetting('MissingE_dashboardTweaks_slimSidebar','MissingE_sidebarTweaks_slimSidebar');
   moveSetting('MissingE_sidebarTweaks_showOverflowTags','MissingE_sidebarTweaks_showTags');
   collapseSettings('MissingE_askTweaks_betterAnswers','MissingE_askTweaks_buttons','MissingE_askTweaks_tags');
   invertSetting('MissingE_betterReblogs_noPassTags','MissingE_betterReblogs_passTags');
}

function onStart(currVersion, prevVersion) {
   if (prevVersion && prevVersion !== currVersion) {
      MissingE.log("Updated Missing e (" + prevVersion + " => " + currVersion + ")");
      setSetting('MissingE_compatCheck',0);
      setSetting('MissingE_previousVersion',prevVersion);
      chrome.browsingData.removeCache({
         "originTypes": {
            "extension": true
         }, "since": 0
      });
   }
   else if (!prevVersion) {
      MissingE.log("Installed Missing e " + currVersion);
      setSetting('MissingE_compatCheck',0);
      setSetting('MissingE_previousVersion',currVersion);
      chrome.tabs.create({url:chrome.extension.getURL("core/options.html")});
   }
   if (getSetting('MissingE_previousVersion','') == '') {
      setSetting('MissingE_previousVersion',currVersion);
   }
   setSetting('MissingE_version',currVersion);
   clearSetting('MissingE_konami_active');
}

onStart(currVersion, getSetting('MissingE_version',null));

if (!MissingE.isSameDay(getSetting('MissingE_lastUpdateCheck',0))) {
   MissingE.debug("Checking current available version.");
   getExternalVersion();
}
fixupSettings();

var fivedays = 432000000;
var now = (new Date()).valueOf();
if (now >= parseInt(getSetting("MissingE_compatCheck",0)) + fivedays) {
   localStorage.setItem("MissingE_compatCheck",now);
   chrome.management.getAll(function(arr) {
      var repl = new Array();
      var ids = new Array();
      for (i=0; i<arr.length; i++) {
         if (arr[i].enabled) {
            switch (arr[i].name) {
               case "Tumblr - Photo Replies Always":
               case "Tumblr post - Upload Photo for all posts":
               case "Tumblr Bookmarker":
               case "Tumblr Dash Links To Tabs":
               case "Tumblr Goto Dash Post":
               case "Tumblr Post Crushes":
               case "Tumblr Reblog Yourself":
               case "Tumblr Reply Replies":
               case "Tumblr SafeDash":
               case "Tumblr Timestamps":
               //case "Tumblr Sidebr":
                  repl.push(arr[i].name);
                  ids.push(arr[i].id);
                  break;
            }
         }
      }

      if (repl.length > 0) {
         var msg = "======\n Missing e\n======\n\n" +
                   "Functionality of the following installed scripts has been replaced by the 'Missing e' extension. " +
                   "Using them may cause compatibility problems.\n\n" +
                   " - " + repl.join("\n - ") +
                   "\n\nDo you want to disable them?\n\nYou can re-enable or uninstall them later in your " +
                   "Extensions menu.\n\nSee http://missing-e.com/faq for more information.";
         var answer = confirm(msg);
         if (answer) {
            for (i=0; i<ids.length; i++) {
               chrome.management.setEnabled(ids[i], false);
               if (repl[i] === "Tumblr Sidebr") {
                  setSetting("MissingE_sidebarTweaks_addSidebar",1);
               }
            }
         }
      }
   });
}
