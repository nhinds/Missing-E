/* TODO: publish text when clicking on new buttons,
   bypass old buttons?
   fade?
   */

function failAnswer(id,type) {
   $('#post_control_loader_' + id).hide();
   $('#ask_publish_button_' + id).removeAttr('disabled');
   $('#ask_queue_button_' + id).removeAttr('disabled');
   $('#ask_cancel_button_' + id).removeAttr('disabled');
   $('#ask_answer_form_' + id + ' input.MissingE_askFixes_extraBtn')
      .removeAttr('disabled');
   console.log('failed: ' + id);
}

function finishAnswer(id,type) {
   $('#post_control_loader_' + id).hide();
   if (type) {
      $('#post_' + id).fadeOut(function(){$(this).remove()});
   }
   console.log('done: ' + id);
}

function doManualAnswering(e,id,type) {
   var mode = '3';
   if (type === 'draft') { mode = '1'; }
   else if (type === 'private') { mode = 'private'; }
   else if (type === 'publish') { mode = '0'; }
   else if (type === 'queue') { mode = '2'; }

   if (type) {
      $('#post_control_loader_' + id).show();
      $('#ask_publish_button_' + id).attr('disabled','disabled');
      $('#ask_queue_button_' + id).attr('disabled','disabled');
      $('#ask_cancel_button_' + id).attr('disabled','disabled');
      $('#ask_answer_form_' + id + ' input.MissingE_askFixes_extraBtn')
         .attr('disabled','disabled');
   }
   var tags = $('#ask_answer_form_' + id +
                ' input.MissingE_askFixes_tags');
   if (tags.length > 0) {
      tags = tags.val();
      tags = tags.replace(/\s*,\s*/g,'').replace(/,$/,'')
               .replace(/^\s*/,'').replace(/\s*$/,'');
   }
   else {
      tags = '';
   }
   var twitter = $('#ask_answer_form_' + id +
                   ' input.MissingE_askFixes_twitter').is(':checked');
   var answer = $($('#ask_answer_form_' + id).get(0).answer).val();

   $.ajax({
      type: "GET",
      url: "http://www.tumblr.com/edit/" + id,
      dataType: "html",
      postId: id,
      tags: tags,
      mode: mode,
      buttonType: type,
      answer: answer,
      twitter: twitter,
      error: function() {
         failAnswer(this.postId,this.buttonType);
      },
      success: function(data, textStatus) {
         var i;
         var frm = data.indexOf('<form');
         if (frm === -1) {
            failAnswer(this.postId,this.buttonType);
            return;
         }
         html = data.substr(frm);
         while (!(/^<form [^>]*id="edit_post"/.test(html))) {
            html = html.substr(1);
            frm = html.indexOf('<form');
            if (frm === -1) {
               failAnswer(this.postId,this.buttonType);
               return;
            }
            html = html.substr(frm);
         }
         html = html.substr(0,html.indexOf('</form>'));
         var inputs = html.match(/<input[^>]*>/g);
         var textareas = html.match(/<textarea[^>]*>[^<]*<\/textarea>/g);
         var params = {};
         for (i=0; i<inputs.length; i++) {
            var inp = $(inputs[i]);
            var name = inp.attr('name');
            if (name) {
               params[name] = inp.val();
            }
         }
         for (i=0; i<textareas.length; i++) {
            var ta = $(textareas[i]);
            var name = ta.attr('name');
            if (name) {
               params[name] = ta.text();
            }
         }
         params["post[tags]"] = this.tags;
         params["post[state]"] = this.mode;
         params["post[date]"] = "now";
         delete params["preview_post"];
         if (!this.twitter) {
            delete params["send_to_twitter"];
         }
         else {
            params["send_to_twitter"] = "on";
         }
         if (this.buttonType !== '3') {
            params["post[two]"] = this.answer;
         }
         $.ajax({
            type: 'POST',
            url: this.url,
            postId: this.postId,
            buttonType: this.buttonType,
            data: params,
            error: function() {
               failAnswer(this.postId,this.buttonType);
            },
            success: function(data) {
               finishAnswer(this.postId,this.buttonType);
            }
         });
      }
   });

   if (type === "publish" || type === "queue") {
      e.stopPropagation();
   }
}

function moreAnswerOptions(item, defTags, buttons, tags) {
   if (item.tagName !== 'LI' || !$(item).hasClass('post')) {
      return false;
   }
   var answer = $(item).find('form[action="/ask_publish"]');
   if (answer.length === 0) {
      return false;
   }
   var lang = $('html').attr("lang");

   if (buttons === 1) {
      var id = $(item).attr('id').match(/[0-9]*$/)[0];
      var draft = $('<input type="button" class="MissingE_askFixes_extraBtn" ' +
                    'id="ask_draft_button_' + id + '" value="' +
                    locale[lang]["postingFixes"]["submitText"]["draft"] + '" />');
      var priv = $('<input type="button" class="MissingE_askFixes_extraBtn" ' +
                   'id="ask_private_button_' + id + '" value="' +
                   locale[lang]["postingFixes"]["submitText"]["private"] + '" />');

      $('#ask_publish_button_' + id).click(function(e) {
         doManualAnswering(e, id, 'publish');
      });
      $('#ask_queue_button_' + id).click(function(e) {
         doManualAnswering(e, id, 'queue');
      });
      draft.click(function(e) {
         doManualAnswering(e, id, 'draft');
      });
      priv.click(function(e) {
         doManualAnswering(e, id, 'private');
      });

      answer.find('input[name="queue"]').after(' ', draft, ' ', priv);
   }

   if (buttons === 1 || tags === 1) {
      var startTags = $(item).find('div.post_info').text().match(/[A-Za-z\-\_]+/);
      if (defTags) {
         defTags.unshift(startTags[0]);
         startTags = defTags;
      }
      else {
         startTags = [startTags[0]];
      }
      if (startTags) {
         startTags = startTags.join(', ');
      }
      var adding = '<div class="MissingE_askFixes_group">';
      if (tags === 1) {
         adding += '<div>' + locale[lang]["tagsText"] + ': <input ' +
                     'type="text" class="MissingE_askFixes_tags" value="' +
                     startTags + '"/></div>';
      }
      adding += '<div>' + locale[lang]["twitterText"] + ': <input ' +
                  'type="checkbox" class="MissingE_askFixes_twitter" />' +
                  '</div></div>';
      answer.find('div:first').css('padding-top','10px')
         .before(adding);
   }
}

function tagAnswer(item,defTags) {
   if (item.tagName !== 'LI' || !$(item).hasClass('post')) {
      return false;
   }
   var answer = $(item).find('form[action="/ask_publish"]');
   if (answer.length === 0) {
      return false;
   }
   var lang = $('html').attr("lang");
}

chrome.extension.sendRequest({greeting: "settings",
                              component: "askFixes"}, function(response) {
   var askFixes_settings = JSON.parse(response);
   var user = location.href
               .match(/http:\/\/www\.tumblr\.com\/tumblelog\/([^\/]*)/);
   if (user === null || user.length < 2) {
      var me = $('#right_column span.dashboard_controls_posts');
      if (me.length > 0) {
         user = me.parent().attr('href').match(/[^\/]*$/)[0];
      }
      else {
         user = null;
      }
   }
   else {
      user = user[1];
   }

   if (askFixes_settings.buttons === 1 ||
       askFixes_settings.tags === 1) {
      $('head').append('<script type="text/javascript">' +
                     'document.addEventListener(\'mouseup\', function(e) {' +
                     'if (e.which !== 1) { return; }' +
                     'if (!(/ask_[a-z]+_button/.test(e.target.id))) {' +
                        'return;' +
                     '}' +
                     'var id = e.target.id.match(/[0-9]*$/);' +
                     'if (tinyMCE && tinyMCE.get(\'ask_answer_field_\' + id)) {' +
                        'document.getElementById(\'ask_answer_field_\' + id).value = ' +
                        'tinyMCE.get(\'ask_answer_field_\' + id).getContent();' +
                     '}},false);</script>');
   }
   $('#posts li.post').each(function() {
      moreAnswerOptions(this, askFixes_settings.defTags,
                        askFixes_settings.buttons, askFixes_settings.tags);
   });
   document.addEventListener('DOMNodeInserted', function(e) {
      moreAnswerOptions(e.target, askFixes_settings.defTags,
                        askFixes_settings.buttons, askFixes_settings.tags);
   }, false);
});