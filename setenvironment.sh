#!/bin/bash

CWD=`dirname $0`
COMMON="core license identity lib"

for i in $COMMON; do
   if [[ ! -e "$CWD/chrome/$i" ]]; then
      echo "Creating junction for Chrome: $i"
      ln -s  $CWD/$i $CWD/chrome/$i
   fi
   if [[ ! -e "$CWD/missinge.safariextension/$i" ]]; then
      echo "Creating junction for Safari: $i"
      ln -s $CWD/$i $CWD/missinge.safariextension/$i
   fi
   if [[ ! -e "$CWD/firefox/missinge/data/$i" ]]; then
      echo "Creating junction for Firefox: $i"
      ln -s $CWD/$i $CWD/firefox/missinge/data/$i
   fi
   if [[ ! -e "$CWD/opera/$i" ]]; then
      echo "Creating junction for Opera: $i"
      ln -s $CWD/$i $CWD/opera/$i
   fi
done

if [[ ! -f "$CWD/firefox/missinge/lib/localizations.js" ]]; then
   echo "Creating hardlink for Firefox localization module"
   ln -s $CWD/core/localizations.js $CWD/firefox/missinge/lib/localizations.js
fi

if [[ ! -f "$CWD/firefox/missinge/lib/utils.js" ]]; then
   echo "Creating hardlink for Firefox utilities module"
   ln -s $CWD/core/utils.js $CWD/firefox/missinge/lib/utils.js
fi
