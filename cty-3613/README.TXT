The Contest Country Files #3613 were released on 25 March 2026.

The following information can be found at:

   https://www.country-files.com/contest/

     __________________________________________________________________

   This is the home of the contest country files. These files are used by
   amateur radio contest logging software (and other related programs) to
   help determine country multipliers from a callsign. The files are
   updated regularly throughout the year and changes are announced on the
   various contest and logging software reflectors.

   To download the file(s) you need, hover your mouse pointer over the
   word Contest in the menu bar above, and wait until the drop-down lists
   appears. Then click on the link that corresponds to the software you
   are using. Also read “Download Instructions” in the next section below.
     __________________________________________________________________

Download Instructions

   Clicking on any of the “Pingback” links at the bottom of this page will
   take you to the release announcement for that version of the country
   file. For a given release announcement, click on on any of the
   highlighted hyperlinks to the right of the word “Download:” to download
   the files associated with that release. You web browser should prompt
   you to save (download) the file. If the file is displayed in the
   browser window instead, return to this page (using your browser’s Back
   button) and follow these instructions to save it:

     Chrome: Right-click on the file name and choose “Save link as…”

     Firefox: Right-click on the file name and choose “Save Link As…”

     Internet Explorer: Right-click on the file name and choose “Save
     Target As…”

     Netscape Navigator: Hold the SHIFT key down while clicking on the
     hyperlink (file name) and your browser will prompt you to save the
     file.

     Safari: Hold the CTRL key down while clicking on the hyperlink (file
     name) and choose “Download Linked File As…”

   NOTE: To download a ZIP file containing all the files for older
   versions of the country files, follow this link. To download all the
   files associated with that release, click on the hyperlink containing
   the date and version, for example:

   10 May 2013 (CTY-2306)

   NOTE: There are two different versions of CTY.DAT, CTY_WT.DAT,
   CTY_WT_MOD.DAT and WL_CTY.DAT. Beginning with CTY-1805, full callsigns
   in the file are prefixed with the ‘=’ character. Some older logging
   programs will ignore these callsigns, so “old” format versions of the
   files (without the ‘=’) are available. If you click on the appropriate
   link below for your software, you will get the correct version of
   country file.
     __________________________________________________________________

Version Information

   To see the country file change (revision) history, follow this link,
   then click on the “Continue Reading ->” link underneath heading for any
   of the releases.

   Once the file is downloaded and installed, there are several ways to
   tell what version of the country file you have:
    1. In your logging program, try to log the callsign “VERSION” (on a DX
       cluster node, use the SH/H VERSION or SH/SUN VERSION command). Each
       version of the country files will return a different country
       (except for Win-Test, see #3 below). That country will be indicated
       in the release notes for that version.
    2. Open the country file using a text editor like Notepad. Find the
       entry for Canada, VE. In the list of prefixes/callsigns, you’ll
       find a “callsign” that looks like:VERyyyymmdd where “yyyymmdd” is
       the date of the release. For example, CTY-1812 was released on 10
       November, 2008 so the version string in this case is “VER20081110”.
    3. The Win-Test files (cty_wt.dat and cty_wt_mod.dat) have their own
       version information at the top of the file. You can see the version
       number only by going to Options | Data Files | Country Files. You
       can not log the callsign VERSION, it will just come up as Canada,
       regardless of the country file version.

   Except for Win-Test, the CTY file name (i.e. CTY-1812) can not be found
   in the file.
     __________________________________________________________________

A Note about USA Callsign Exceptions

   Many USA callsigns are not in the CQ or ITU zone indicated by the
   number in the callsign. For example, AD1C is in CQ Zone 4, not Zone 5.
   The country files do list a number of these callsigns with the correct
   zone. However, because there are tens of thousands of such callsigns,
   only the most active contesters are included. Here’s how the list is
   created:
    1. Using the Super Check Partial Database of active contesters, build
       a list of callsigns that are found in 100 or more logs. 100 is an
       arbitrary number, but it tends to limit the number of callsign/zone
       exceptions to around 500, which seems like a reasonable number of
       active contesters (as compared to the total size of the country
       file).
    2. For each callsign that met the criteria in #1 above, predict the CQ
       and ITU zones based on the number in the callsign. For example, ‘1’
       is CQ zone 5, ‘5’ is ITU zone 7, etc.
    3. For each callsign that met the criteria in #1 above, look up the
       callsign in the current FCC database, and determine the CQ and ITU
       zones based on the state (as listed). For example, Wyoming is CQ
       Zone 4, California is ITU zone 3. The ITU zone is determined from
       the state only for states that reside entirely within a single ITU
       zone (like Indiana, not Illinois). When a state contains multiple
       ITU zones, a ZIP code database is used to estimate a more precise
       location relative to the ITU zone border.
    4. If the CQ or ITU zone from step #2 does NOT match the CQ or ITU
       zone from step #3, add an exception to the country file, showing
       the actual CQ and/or ITU zones.

   That’s the process, plain and simple. It’s fully automated, and rewards
   the most active contesters. If you want to “get on the list”, then “get
   on the air”!

   If you do not live in or operate from the state listed as your callbook
   address, let me know if it would result in a change to your CQ or ITU
   zone. Many states cross ITU zone boundaries, so it’s harder to get the
   ITU zone exceptions correct. If your ITU (or CQ) zone is incorrect, let
   me know and it will be fixed in the next release.

