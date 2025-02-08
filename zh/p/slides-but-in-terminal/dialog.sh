#!/bin/bash

# 使用 dialog 创建菜单
choice=$(dialog --clear --title "Menu" --menu "Make Your Choice" 10 40 3 \
         1 "Show Greeting" 2 "Enter Something" 3 "Show Figure"  2>&1 >/dev/tty)

# 处理用户选择
clear  # 清除屏幕，防止影响后续输出
case $choice in
    1) 
        dialog --msgbox "Hello" 6 20
        ;;
    2) 
        input=$(dialog --inputbox "Enter: " 8 40 2>&1 >/dev/tty)
        clear
        echo "Received：$input"
        ;;
    3) 
        echo "退出程序"
        exit 0
        ;;
    *) 
        echo "无效选项"
        ;;
esac
