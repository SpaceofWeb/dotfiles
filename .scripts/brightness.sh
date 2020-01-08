#!/bin/sh


path="/sys/class/backlight/intel_backlight/brightness"
curr=$(cat $path)


if [ $1 = "-dec" ]; then
	curr=$((curr - $2))
else
	curr=$((curr + $2))
fi


echo $curr > $path

echo $(cat $path)


