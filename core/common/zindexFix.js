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

(function($) {

MissingE.utilities.zindexFix = {

   futureEmbed: function(item) {
      var val = $(item).val().replace(/wmode="[^"]*"/,'wmode="opaque"');
      $(item).val(val);
   },

   doEmbed: function(em) {
      var node = $(em).clone();
      node.attr('wmode','opaque').addClass('zindexfixed');
      $(em).replaceWith(node);
   },

   run: function() {
      $('#posts div.post embed').each(function() {
         MissingE.utilities.zindexFix.doEmbed(this);
      });

      $('#posts div.post div.video + input:hidden').each(function() {
         MissingE.utilities.zindexFix.futureEmbed(this);
      });

      extension.addAjaxListener(function(type,list) {
         if (type === 'notes') { return; }
         $.each(list, function(i,val) {
            $('#'+val).find('embed').each(function() {
               MissingE.utilities.zindexFix.doEmbed(this);
            });
            $('#'+val).find('div.video + input:hidden').each(function() {
               MissingE.utilities.zindexFix.futureEmbed(this);
            });
         });
      });
   },

   init: function() {
      MissingE.utilities.zindexFix.run();
   }
};

if (extension.isChrome ||
    extension.isFirefox) {
   MissingE.utilities.zindexFix.init();
}

}(jQuery));
