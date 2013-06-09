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

(function($){

if (typeof MissingE.packages.askTweaks !== "undefined") { return; }

MissingE.packages.askTweaks = {

   addSubmissionControls: function(item) {
      var lang = $('html').attr('lang');
      var publishText = MissingE.getLocale(lang).dashTweaksText.publish;
      var queueText = MissingE.getLocale(lang).dashTweaksText.queue;
      var post = $(item);
      if (!post.hasClass('submission')) { return; }
      var id = item.id.match(/\d+$/);
      if (!id) { return; }
      id = id[0];
      var controls = post.find('.post_controls_inner');
      if (controls.find('a[onclick*="queue_post"], ' +
                        'a[onclick*="approve_post"]').length === 0) {
         var addPub = $('<a href="#" onclick="return approve_post(' + id +
                        ');" class="post_control" />');
         addPub.attr('title', publishText);
         addPub.text(publishText);
         var addQueue = $('<a href="#" onclick="return queue_post(' + id +
                          ');" class="post_control" />');
         addQueue.attr('title', queueText);
         addQueue.text(queueText);
         var block = controls.find('a[id^="post_block_"]');
         if (block.length === 1) {
            block.after(addPub);
            block.after(addQueue);
         }
         else {
            controls.prepend(addPub);
            controls.prepend(addQueue);
         }
      }
   },

   setupMassDeleteAsk: function(item) {
      if ($('#' + item.id + '_select').length > 0) {
         return;
      }
      var mds = $('<span />', {"class": "MissingEmassDeleteSpan"})
                  .append($('<input />',{type: "checkbox", val: "0",
                                         id: item.id + "_select",
                                         "class": "MissingEmassDeleteSelect"}));
      if ($(item).hasClass("fan_mail")) {
         mds.appendTo($(item));
      }
      else {
         mds.appendTo($(item).find('div.post_controls_inner'));
      }
   },

   deleteMessages: function(key, lang) {
      var posts = [], count = 0;
      var set = $('#posts li.MissingEmdSelected');
      if (set.length < 1) { return; }
      var exemplar = set.eq(0).data('blog');
      var remset = set.filter(function() {
         if (count >= 100) { return false; }
         if ($(this).data('blog') === exemplar) {
            count++;
            return true;
         }
         else { return false; }
      }).each(function(i) {
         if (i >= 100) { return false; }
         posts.push(this.id.match(/\d+$/)[0]);
      });
      $.ajax({
         type: "POST",
         url: '/delete_posts',
         data: {"post_ids": posts.join(','),
                "form_key": key},
         error: function() {
            alert(MissingE.getLocale(lang).massDelete.messagesError);
         },
         success: function() {
            remset.removeClass('MissingEmdSelected').remove();
            MissingE.packages.askTweaks.deleteMessages(key, lang);
         }
      });
   },

   failAnswer: function(id) {
      $('#post_control_loader_' + id).hide();
      $('#ask_publish_button_also_' + id).removeAttr('disabled');
      $('#ask_queue_button_also_' + id).removeAttr('disabled');
      $('#ask_draft_button_also_' + id).removeAttr('disabled');
      $('#ask_private_button_' + id).removeAttr('disabled');
      $('#ask_cancel_button_' + id).removeAttr('disabled');
      $('#private_answer_button_' + id).removeAttr('disabled');
      $('#ask_answer_form_' + id + ' .MissingE_postMenu input')
         .attr('disabled','disabled');
   },

   finishAnswer: function(id,type) {
      $('#post_control_loader_' + id).hide();
      if (type) {
         $('#post_' + id).fadeOut(function(){$(this).remove();});
      }
   },

   doPostAnswer: function(data, url, postId, tags, mode, buttonType, answer, twitter) {
      var i;
      var frm = data.indexOf('<form');
      if (frm === -1) {
         MissingE.packages.askTweaks.failAnswer(postId);
         return;
      }
      var html = data.substr(frm);
      while (!(/^<form [^>]*id="edit_post"/.test(html))) {
         html = html.substr(1);
         frm = html.indexOf('<form');
         if (frm === -1) {
            MissingE.packages.askTweaks.failAnswer(postId);
            return;
         }
         html = html.substr(frm);
      }
      html = html.substr(0,html.indexOf('</form>'));
      var inputs = html.match(/<input[^>]*>/g);
      var textareas = html.match(/<textarea[^>]*>[^<]*<\/textarea>/g);
      var params = {};
      var name;
      for (i=0; i<inputs.length; i++) {
         var theInput = $(inputs[i]);
         if (theInput.length === 0) { continue; }
         name = theInput.attr("name");
         if (!name) { continue; }
         if (theInput.attr("type") !== "checkbox" ||
               theInput.checked === true) {
            params[name] = theInput.val();
         }
         else if (MissingE.packages.askTweaks.allowPhotoReplies &&
                  name === "allow_photo_replies") {
            params[name] = theInput.val();
         }
      }
      for (i=0; i<textareas.length; i++) {
         var ta = $(textareas[i]);
         name = ta.attr('name');
         if (name) {
            params[name] = ta.text();
         }
      }
      params["post[tags]"] = tags;
      params["post[state]"] = mode;
      params["post[date]"] = "now";
      delete params["preview_post"];
      delete params["post[promotion_type]"];
      if (!twitter) {
         delete params["send_to_twitter"];
      }
      else {
         params["send_to_twitter"] = "on";
      }
      if (buttonType !== '3') {
         params["post[two]"] = answer;
      }
      
      if (extension.isFirefox) {
         console.log("SENDFULLASK");
         extension.sendRequest("sendFullAsk", {pid: postId, data: params},
                               function(response) {
            if (response.success) {
               MissingE.packages.askTweaks.finishAnswer(postId, buttonType);
            }
            else {
               MissingE.packages.askTweaks.failAnswer(postId);
            }
         });
      }
      else {
         $.ajax({
            type: 'POST',
            url: url,
            dataType: 'html',
            postId: postId,
            buttonType: buttonType,
            data: params,
            error: function() {
               MissingE.packages.askTweaks.failAnswer(this.postId);
            },
            success: function() {
               MissingE.packages.askTweaks
                  .finishAnswer(this.postId,this.buttonType);
            }
         });
      }
   },

   doManualAnswering: function(id,type) {
      var mode = '3';
      if (type === 'draft') { mode = '1'; }
      else if (type === 'private') { mode = 'private'; }
      else if (type === 'publish') { mode = '0'; }
      else if (type === 'queue') { mode = '2'; }

      if (type) {
         $('#post_control_loader_' + id).show();
         $('#ask_publish_button_also_' + id).attr('disabled','disabled');
         $('#ask_queue_button_also_' + id).attr('disabled','disabled');
         $('#ask_draft_button_also_' + id).attr('disabled','disabled');
         $('#ask_private_button_' + id).attr('disabled','disabled');
         $('#ask_cancel_button_' + id).attr('disabled','disabled');
         $('#private_answer_button_' + id).attr('disabled','disabled');
         $('#ask_answer_form_' + id + ' .MissingE_postMenu input')
            .attr('disabled','disabled');
      }
      var tags = $('#ask_answer_form_' + id +
                   ' input.MissingE_askTweaks_tags');
      if (tags.length > 0) {
         tags = tags.val();
         tags = tags.replace(/,(\s*,)*/g,',').replace(/\s*,\s*/g,',')
                  .replace(/,$/,'').replace(/^\s*/,'').replace(/\s*$/,'');
      }
      else {
         tags = '';
      }
      var twitter = $('#ask_answer_form_' + id +
                      ' input.MissingE_askTweaks_twitter').is(':checked');
      var answer = $($('#ask_answer_form_' + id).get(0).answer).val();
      var url = "http://www.tumblr.com/edit/" + id;
      if (extension.isFirefox) {
         extension.sendRequest("getFullAsk", {pid: id}, function(response) {
            if (response.success) {
               MissingE.packages.askTweaks.doPostAnswer(response.data, url,
                  id, tags, mode, type, answer, twitter);
            }
            else {
               MissingE.packages.askTweaks.failAnswer(id);
            }
         });
      }
      else {
         $.ajax({
            type: "GET",
            url: url,
            dataType: "html",
            postId: id,
            tags: tags,
            mode: mode,
            buttonType: type,
            answer: answer,
            twitter: twitter,
            error: function(a) {
               MissingE.packages.askTweaks.failAnswer(this.postId);
            },
            success: function(data) {
               MissingE.packages.askTweaks.doPostAnswer(data, this.url,
                  this.postId, this.tags, this.mode, this.buttonType, this.answer,
                  this.twitter);
            }
         });
      }

      return false;
   },

   moreAnswerOptions: function(item, tagAsker, defTags, betterAnswers) {
      var i;
      if (item.tagName !== 'DIV' || !$(item).hasClass('post')) {
         return false;
      }
      var answer = $(item).find('form[action="#"]');
      if (answer.length === 0) {
         return false;
      }
      var lang = $('html').attr("lang");
      var id = $(item).attr('id').match(/\d*$/)[0];

      if (betterAnswers === 1) {
         var allbtns = [];
         var suffix;
         for (i in MissingE.getLocale(lang).postingTweaks.submitText) {
            if (MissingE.getLocale(lang).postingTweaks.submitText
                  .hasOwnProperty(i)) {
               var newbtn;
               if (i === 'publish') { continue; }
               if (i === 'queue' || i === 'draft') {
                  suffix = 'also_';
               }
               else {
                  suffix = '';
               }
               newbtn = $('<button />',
                          {"class": "chrome",
                           id: "ask_" + i + "_button_" + suffix + id,
                           click: function(){ return false; }})
                           .append($('<div />',
                                     {"class": "chrome_button",
                                      text: MissingE.getLocale(lang)
                                             .postingTweaks.submitText[i]})
                              .prepend($('<div />',
                                         {"class": "chrome_button_left"}))
                              .append($('<div />',
                                        {"class": "chrome_button_right"})));
               allbtns.push(newbtn);
               allbtns.push($('<br />'));
            }
         }
         var btn = $('#ask_publish_button_' + id);
         var postbtn = $('<button />',
                         {"class": "chrome blue",
                          id: "ask_publish_button_also_" + id,
                          name: "publish",
                          type: "submit",
                          click: function() { return false; }})
                          .append($('<div />',
                                    {"class": "chrome_button",
                                     text: btn.text()})
                                    .prepend($('<div />',
                                               {"class": "chrome_button_left"}))
                                    .append($('<div />',
                                              {"class": "chrome_button_right"})));
         btn.after(postbtn);

         if (allbtns.length >= 2) {
            allbtns.splice(allbtns.length-1,1);
         }
         var postMenu = $('<div class="MissingE_postMenu" />');
         for (i=0; i<allbtns.length; i++) {
            postMenu.append(allbtns[i]);
         }
         postMenu.insertAfter(postbtn);
         btn.hide();
         $('#ask_publish_button_also_' + id).click(function() {
            MissingE.packages.askTweaks.doManualAnswering(id, 'publish');
         });
         $('#ask_queue_button_also_' + id).click(function() {
            MissingE.packages.askTweaks.doManualAnswering(id, 'queue');
         });
         $('#ask_draft_button_also_' + id).click(function() {
            MissingE.packages.askTweaks.doManualAnswering(id, 'draft');
         });
         $('#ask_private_button_' + id).click(function() {
            MissingE.packages.askTweaks.doManualAnswering(id, 'private');
         });

         var x;
         var asker = $(item).find('div.post_info').html();
         asker = asker.replace(/<br[^>]*>/g,'')
               .replace(/<span[^>]*MissingE_timestamp[^>]*>[^<]*<[^>]*>/g,'');
         asker = asker.replace(/<[^>]*>/g,'');
         asker = asker.match(/[0-9A-Za-z\-\_]+/);
         if (!asker || asker.length === 0) {
            asker = null;
         }
         else {
            asker = MissingE.escapeHTML(asker[0]);
         }
         if ((!asker || asker === "") &&
             /anonymous_avatar/.test($(item).find('div.avatar_and_i').html())) {
            asker = MissingE.escapeHTML(MissingE.getLocale(lang).anonymous);
         }
         if (tagAsker === 1 && asker && asker !== "") {
            startTags = [asker];
         }
         else {
            startTags = [];
         }
         if (defTags !== '') {
            for (x=0; x<defTags.length; x++) {
               startTags.push(defTags[x]);
            }
         }
         if (startTags.length > 0) {
            startTags = startTags.join(', ');
         }
         else {
            startTags = '';
         }
         var adding = $('<div />', {"class": "MissingE_askTweaks_group"})
                        .append($('<div />',
                                  {text: MissingE.getLocale(lang).tagsText +
                                         ": "})
                                 .append($('<input />',
                                           {type: "text",
                                            "class": "MissingE_askTweaks_tags",
                                            val: startTags})))
                        .append($('<div />',
                                  {text: MissingE.getLocale(lang).twitterText +
                                          ": "})
                                 .append($('<input />',
                                           {type: "checkbox",
                                            "class": "MissingE_askTweaks_twitter"})));
         answer.find('div:first').css('padding-top','10px')
            .addClass('MissingE_askTweaks_buttons').before(adding);
         $(item).find('input.MissingE_askTweaks_tags').keydown(function(e) {
            if (e.which === 74 || e.which === 75 ||
                e.which === 37 || e.which === 39) {
               e.stopPropagation();
            }
         });
      }
   },

   run: function() {
      var settings = this.settings;
      var lang = $('html').attr('lang');
      
      this.allowPhotoReplies = settings.photoReplies === 1;

      /*
      $('#posts li.fan_mail .controls_link.to_name').live('click', function() {
         extension.sendRequest('fanMail');
      });
      */

      if (settings.askDash === 1) {
         var i;
         $(document).bind('afterClose.facebox', function() {
            $.globalEval('Tumblr.KeyCommands.suspended=false;');
         });
         var askLabel = '<a class="MissingE_askPerson_avatar" href="#"></a>';
         for (i=0; i<MissingE.getLocale(lang).askPerson.length; i++) {
            if (i>0) { askLabel += " "; }
            if (MissingE.getLocale(lang).askPerson[i] === "U") {
               askLabel += '<span class="MissingE_askPerson"></span>';
            }
            else {
               askLabel += MissingE.escapeHTML(MissingE.getLocale(lang)
                                                   .askPerson[i]);
            }
         }
         askLabel += ':';
         $('body').append('<div id="MissingE_askbox" style="display:none;">' +
                          '<p>' + askLabel + '</p>' +
                          '<iframe frameborder="0" scrolling="no" ' +
                          'width="100%" height="149" /></div>');
         $('#posts div.user_menu_list a[href$="/ask"]').live('click',
                                                             function() {
            var user = $(this).closest('div.user_menu_list')
                          .find('a[following]').attr('href').match(/[^\/]*$/)
                          .join('');
            var avatar = $(this).closest('div.post')
                           .find('div.avatar_and_i a.post_avatar')
                           .css('background-image');
            avatar = avatar.replace(/64\./,'40.');
            var url = this.href.match(/(http[s]?:\/\/([^\/]*))/);
            if (url && url.length > 2) {
               var skipRender = false;
               var ifr = $('#facebox iframe');
               if (ifr.length > 0) {
                  ifr = ifr.get(0);
                  var referrer = 'http://www.tumblr.com/ask_form/' +
                                    encodeURI(url[2]);
                  try {
                     referrer = ifr.contentDocument.referrer;
                  }
                  catch (e) {
                  }
                  if (ifr.src === 'http://www.tumblr.com/ask_form/' +
                                    encodeURI(url[2]) &&
                      referrer !== 'http://www.tumblr.com/ask_form/' +
                                    encodeURI(url[2])) {
                     skipRender = true;
                     $.facebox.show('MissingE_askbox_loaded');
                  }
               }
               if (!skipRender) {
                  $('#MissingE_askbox .MissingE_askPerson')
                     .html('<a href="' + encodeURI(url[1]) + '">' +
                           MissingE.escapeHTML(user) + '</a>');
                  $('#MissingE_askbox .MissingE_askPerson_avatar')
                     .attr('href',encodeURI(url[1]))
                     .css('background-image',avatar);
                  $.facebox({div:'#MissingE_askbox'}, 'MissingE_askbox_loaded');
                  $('#facebox .MissingE_askbox_loaded iframe')
                     .attr('src','http://www.tumblr.com/ask_form/' +
                           encodeURI(url[2]));
                  $('#facebox').draggable({
                     containment:'document',
                     cursor:'move',
                     start: function(e) {
                        if ($(e.target).find('div.MissingE_askbox_loaded')
                              .length === 0) {
                           return false;
                        }
                     }
                  });
               }
               $(this).closest('div.user_menu').hide();
               return false;
            }
         });
      }
      if (MissingE.isTumblrURL(location.href, ["messages"])) {
         if (settings.betterAnswers === 1) {
            $('#posts div.MissingE_postMenu .chrome')
               .live('mouseover', function() {
               $(this).addClass('blue');
            }).live('mouseout', function() {
               $(this).removeClass('blue');
            });
            $('head').append('<script type="text/javascript">' +
               'document.addEventListener(\'mouseup\', function(e) {' +
               'if (e.which !== 1) { return; }' +
               'var trg = e.target;' +
               'while (trg) {' +
                  'if (/ask_[a-z]+_button/.test(trg.id)) {' +
                     'break;' +
                  '}' +
                  'trg = trg.parentNode;' +
               '}' +
               'if (!trg || !(/ask_[a-z]+_button/.test(trg.id))) {' +
                  'return;' +
               '}' +
               'var id = trg.id.match(/[0-9]*$/);' +
               'if (tinyMCE && tinyMCE.get(\'ask_answer_field_\' + id)) {' +
                  'document.getElementById(\'ask_answer_field_\' + id)' +
                     '.value = tinyMCE.get(\'ask_answer_field_\' + id)' +
                                 '.getContent();' +
               '}},false);</script>');
         }
         $('#posts div.post').each(function() {
            MissingE.packages.askTweaks
               .moreAnswerOptions(this, settings.tagAsker,
                                  settings.defaultTags,
                                  settings.betterAnswers);
         });
         extension.addAjaxListener(function(type,list) {
            if (type === "messages") {
               $.each(list, function(i, val) {
                  MissingE.packages.askTweaks
                     .moreAnswerOptions($('#'+val).get(0), settings.tagAsker,
                                        settings.defaultTags,
                                        settings.betterAnswers);
               });
            }
         });
         if (settings.submissionControls) {
            $('#posts li.submission').each(function() {
               MissingE.packages.askTweaks.addSubmissionControls(this);
            });
            extension.addAjaxListener(function(type,list) {
               if (type === "messages") {
                  $.each(list, function(i, val) {
                     MissingE.packages.askTweaks
                        .addSubmissionControls($('#'+val).get(0));
                  });
               }
            });
         }
         if (settings.massDelete === 1) {
            var afterguy = $('#right_column a.delete_all_messages').closest('ul');
            var beforeguy;
            if (afterguy.length > 0) {
               beforeguy = afterguy.closest('ul').next();
            }
            else {
               beforeguy = $('#MissingE_sidebar');
               if (beforeguy.length === 0) {
                  beforeguy = $('#right_column a.messages').closest('ul').next();
               }
            }
            $('head').append('<style type="text/css">' +
                             '#right_column #MissingEmassDeleter a { ' +
                             'background-image:url("' +
                             extension.getURL("core/askTweaks/massDelete.png") +
                             '") !important; }</style>');
            $('<ul class="controls_section" id="MissingEmassDeleter">' +
              '<li><a href="#" class="select_all">' +
              '<div class="hide_overflow">' +
              MissingE.escapeHTML(MissingE.getLocale(lang)
                                    .massDelete.selectAll) +
              '</div></a></li>' +
              '<li><a href="#" class="deselect_all">' +
              '<div class="hide_overflow">' +
              MissingE.escapeHTML(MissingE.getLocale(lang)
                                    .massDelete.deselectAll) +
              '</div></a></li>' +
              '<li><a href="#" class="delete_selected">' +
              '<div class="hide_overflow">' +
              MissingE.escapeHTML(MissingE.getLocale(lang)
                                    .massDelete.deleteSelected) +
              '</div></a></li></ul>')
                  .insertBefore(beforeguy);
            $('#posts div.post').each(function() {
               MissingE.packages.askTweaks.setupMassDeleteAsk(this);
            });
            extension.addAjaxListener(function(type,list) {
               if (type === "messages") {
                  $.each(list, function(i, val) {
                     MissingE.packages.askTweaks
                        .setupMassDeleteAsk($('#'+val).get(0));
                  });
               }
            });
            $('#MissingEmassDeleter a').click(function() {
               var btn = $(this);
               if (btn.hasClass('select_all')) {
                  $('#posts input.MissingEmassDeleteSelect').each(function() {
                     this.checked = true;
                     $(this).trigger('change');
                  });
               }
               else if (btn.hasClass('deselect_all')) {
                  $('#posts input.MissingEmassDeleteSelect').each(function() {
                     this.checked = false;
                     $(this).closest('div.post')
                        .removeClass('MissingEmdSelected');
                  });
               }
               else if (btn.hasClass('delete_selected')) {
                  var key = $('#posts input[name="form_key"]:first').val();
                  var count = $('#posts li.MissingEmdSelected').length;
                  if (count > 0) {
                     var sureMsg = MissingE.getLocale(lang).massDelete
                                       .messagesConfirm.replace('#',count);
                     if (MissingE.getLocale(lang).massDelete.confirmReplace) {
                        var countOp = count;
                        switch(MissingE.getLocale(lang).massDelete
                                 .confirmReplace.operation[0]) {
                           case "+":
                              countOp += MissingE.getLocale(lang).massDelete
                                          .confirmReplace.operation[1];
                              break;
                           case "-":
                              countOp -= MissingE.getLocale(lang).massDelete
                                          .confirmReplace.operation[1];
                              break;
                           case "%":
                              countOp %= MissingE.getLocale(lang).massDelete
                                          .confirmReplace.operation[1];
                              break;
                        }
                        if (MissingE.getLocale(lang).massDelete
                              .confirmReplace[countOp]) {
                           var r;
                           var repls = MissingE.getLocale(lang).massDelete
                                          .confirmReplace[countOp];
                           for (r in repls) {
                              if (repls.hasOwnProperty(r)) {
                                 sureMsg = sureMsg.replace(r,repls[r]);
                              }
                           }
                        }
                     }
                     var sure = confirm(sureMsg);
                     if (sure) {
                        MissingE.packages.askTweaks.deleteMessages(key, lang);
                     }
                  }
               }
               return false;
            });
            $('input.MissingEmassDeleteSelect').live('change', function() {
               var item = $(this).closest('div.post');
               if (this.checked) {
                  var blog;
                  item.addClass('MissingEmdSelected');
                  if (!item.data('blog')) {
                     if (item.hasClass('fan_mail')) {
                        blog = item.find('a.reply_link').attr('href');
                        blog = blog.match(/\/from\/([^\/]*)\/reply/)[1];
                        item.data('blog',blog);
                     }
                     else if (item.find('div.post_controls a').length <= 1) {
                        item.data('blog','private');
                     }
                     else {
                        blog = item.find('a.post_permalink').attr('href');
                        blog = blog.replace(/^[^\/]*\/\//,'')
                                    .replace(/\/.*/,'');
                        item.data('blog',blog);
                     }
                  }
               }
               else {
                  item.removeClass('MissingEmdSelected');
               }
            });
         }
      }
   },

   runAskForm: function() {
      if (this.settings.scroll) {
         extension.insertStyleSheet("core/askTweaks/askboxScroll.css");
      }
      if (this.settings.adjustDomain) {
         document.domain = "tumblr.com";
      }
   },

   init: function() {
      extension.sendRequest("settings", {component: "askTweaks"},
                            function(response) {
         if (response.component === "askTweaks") {
            var i;
            MissingE.packages.askTweaks.settings = {};
            for (i in response) {
               if (response.hasOwnProperty(i) &&
                   i !== "component") {
                  MissingE.packages.askTweaks.settings[i] = response[i];
               }
            }
            if (!MissingE.packages.askTweaks._hasRun) {
               if (MissingE.isTumblrURL(location.href, ["askForm",
                                                        "fanMail"])) {
                  MissingE.packages.askTweaks.runAskForm();
               }
               else if (MissingE.isTumblrURL(location.href)) {
                  MissingE.packages.askTweaks.run();
               }
               MissingE.packages.askTweaks._hasRun = true;
            }
         }
      });
   }
};

if (extension.isChrome ||
    extension.isFirefox ||
    extension.isOpera) {
   if (window.top === window ||
       MissingE.isTumblrURL(location.href, ["askForm", "fanMail"])) {
      MissingE.packages.askTweaks.init();
   }
}

}((typeof jQuery !== "undefined" ? jQuery : null)));
