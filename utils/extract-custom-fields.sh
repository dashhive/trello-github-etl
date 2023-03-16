#/usr/bin/env bash
prettier board.json > pretty-board.json
TOTAL_LINES=$(wc -l pretty-board.json | awk '{print $1}' | tr -d '[:space:]');
LINE=$(grep -n 'customFields' ./pretty-board.json  | tail -n 1 | cut -d':' -f 1 | tr -d '[:space:]');
AFTER=$(tail -n $(( $TOTAL_LINES - $LINE + 1 )) ./pretty-board.json | grep -n -E '^  \],$' | head -n 1 | cut -d':' -f 1 | tr -d '[:space:]');
tail -n $(( $TOTAL_LINES - $LINE + 1 )) ./pretty-board.json | head -n $AFTER > tmp-custom-fields.data

echo 'yo'

#echo '{ ' > m
#cat tmp-custom-fields.data >> m
#echo '} ' >> m
#
#echo 'm: '
#cat m

node ./step2.js 
