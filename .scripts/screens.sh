#!/bin/sh

choices="external\nlaptop\ndual\nmanual"

chosen=$(echo "$choices" | dmenu -fn 20 -i)

case "$chosen" in
    external) xrandr --output HDMI-1 --auto --primary --output eDP-1 --off ;;
    laptop) xrandr --output eDP-1 --auto --primary --output HDMI-1 --off ;;
    dual) xrandr --output eDP-1 --auto --primary --output HDMI-1 --auto --right-of eDP-1 ;;
    manual) arandr ;;
esac

