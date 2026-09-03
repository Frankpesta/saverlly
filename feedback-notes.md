# Feedback Notes

Hi, I checked out the changes. It's much better.

Here are my comments.

## General Comments

1. The dashboard design looks like an AI build and it's too messy and confusing — it doesn't really feel on brand.
2. **Calendar**
   a) I want it to look a bit more modern and on brand (it's the same as before).
   b) You should be able to just type the date like `01012030` and it should auto-format it.
3. **Clock Picker**
   a) I do not like the look of the clock picker.
   b) I want to be able to type or select.
4. **Commission performance — Chart info box position:** See the video when mouse entering, etc. Still the same issue.
5. **Notification pop up**
   a) Need to reposition what's most important and what isn't (for example, the date and time is not that important — it should not be placed so close to the message, etc.).
6. All the fonts used are the wrong font.
7. The mouse must change to a pointer when hovering over a clickable button.
8. Just noticed there isn't a way to upload a profile image.
9. We need to make the "generate code" for kiosks simpler and easier to find — right now you have to look for it until you find it.

---

## Backend Comments

### Login Page

**01 Login:**
1. a) The login section should be on the right side.

### Dashboard

**02 Dashboard:**
1. a) "Needs attention" — how do I clear/remove stuff from this list?

### Account and Settings

1. **02 Profile - Account:** If it takes you to the settings page, then you can remove the account option.
2. The current password field is filled out for some reason. I think if you enter it once, it stays there forever.

### Kiosks

**04 Kiosks - Add New 01:**
1. a) We need to simplify the naming, etc. For example, "Who is this kiosk business?" can be removed — instead of "Name" it should be called "Kiosk Name" (same with all other such fields).

**04 Kiosks - Edit:**
2. a) There needs to be a bigger difference between the owner and manager.
   b) There needs to be a bigger difference between the active and disabled status.

### Locations

1. The setup code will be needed for each location one time — will you be able to auto-install it on all devices in that location, or is it per device?
2. **05 Locations - Add Location 01:**
   a) State and city should be swapped places.
   b) The states don't update according to the state selected.
   c) I don't see this part of the zip (but I want to be able to enable letters and dashes "-" at a later time, and change the max character amount allowed).
3. You need to be able to delete locations — I want this on the main locations page as well.

### Merchants

1. You need to be able to delete merchants — I want this on the main merchants page as well.

### Scrape Sources

**08 Add scrape source:**
1. a) What is the coupon code selector and how do I get it?
   b) "Scrape every..." — you shouldn't be able to type a time that can't be valid (e.g. `00222`).
   d) "Scrape every..." — what does "Defaults to daily" mean? I see it doesn't change.

### Affiliate Programs

**09 Add affiliate:**
1. a) Why is the "Value" field filled out by default?

### Promotions

1. New Promotions > Show Everywhere: I can't check off this box.
2.

---

## Kiosk Portal

### Login Page

**01 Login:**
1. a) The login section should be on the right side.

### Login — Set a New Password

**01 Change Password:**
1. a) The login section should be on the right side.

### Locations

1. You need to be able to also delete locations from the main locations page.
2. **03 Locations:**
   a) State and city should be swapped places.
   b) The states don't update according to the state selected.
3. You need to be able to add a manager.

### 02 Devices

1. The "Download Agent" button doesn't work.

### Settings

1. In the kiosk box at the bottom it says "Contact your saverlly admin...." How do I change this email address from the backend?

### Announcements

1. How do I delete everything if I want to start from a blank page?
2. Only a square for the shapes?
3. There's no way to know or set what the button does (e.g. close the announcement, open a link, open email, etc.).
4. Need to be able to make text clickable.
5. When uploading an image/logo, it doesn't show up in the preview.
6. "Body" — what is this, and why is it required?
7. How do I change the doc size from vertical 8.5x11 to horizontal?
8. You need to be able to delete stuff by just pressing the delete button on your keyboard.

### Add Team Member

1. You need to be able to select which location(s) they can manage when adding a new member.
2. Need to be able to edit names and email addresses as well.
3. When adding a new member, I don't get their first-time password.

---

## Kiosk Manager Portal

### Locations

1. They should be able to see the location(s) they have access to.
2. Setup code — can't generate the code.

### Announcements

1. "All locations" — if they don't have access to any location, then it should be disabled. Also, by default it should be checked off.
