

$(function() {
	//activate smoothscroll
	 smoothScroll.init();

	//scroll to top  
	$(window).scroll(function(){
			if ($(window).scrollTop() > 500) 
			{
		        $('#back-to-top').fadeIn();
		    } 
			else 
			{
		        $('#back-to-top').fadeOut();
		    }
		});	
	
    // apply matchHeight to each item container's items
    $('.media').each(function() {
        $(this).children('.media-werkwijze').matchHeight();
    });

    $('.media').each(function() {
        $(this).children('.media-visie').matchHeight();
    });

    $('.items-container').each(function() {
        $('.item').matchHeight();
    });
	

/*	//mixitup
	 $('#Container').mixItUp({
	    load: {
	      filter: '.bso, .kinderopvang'
	    },
	    controls: {
	      toggleFilterButtons: true
	    }
	  });
*/

});
