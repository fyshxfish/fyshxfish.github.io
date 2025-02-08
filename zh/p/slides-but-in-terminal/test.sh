#!/bin/bash

codes=( {0..9} 21 {31..37} {40..47} 49 {91..107} )

count=0
for i in "${codes[@]}"; do
    printf "\033[%dm%3d: fyshx\033[0m  " "$i" "$i"
    ((count++))
    if (( count % 8 == 0 )); then
        echo
    fi
done

printf "\n01;02;03;21;34;101: \033[2;3;34;01;21myour text\033[0m\n";